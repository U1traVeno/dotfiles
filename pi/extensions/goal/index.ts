import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { StringEnum, isContextOverflow, isRetryableAssistantError } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { DEFAULT_GOAL_CONFIG, loadGoalConfig, type GoalConfig } from "./config.ts";
import {
  GET_GOAL_DESCRIPTION,
  GOAL_CONTINUATION_TRIGGER,
  OBJECTIVE_UPDATED_STEERING,
  UPDATE_GOAL_DESCRIPTION,
  renderGoalPrompt,
} from "./prompts.ts";
import { classifyGoalError, computeBackoffDelay, parseRetryAfter } from "./retry.ts";
import {
  GOAL_STATE_ENTRY,
  GOAL_STATE_VERSION,
  canLaunchContinuation,
  canModelUpdateGoal,
  createGoalState,
  evolveGoalState,
  makeContinuationToken,
  reconstructGoalState,
  shouldExposeGoalTools,
  validateObjective,
  type ContinuationToken,
  type GoalState,
  type GoalStateEntryData,
  type GoalStatus,
  type GoalTransition,
  type ModelGoalStatus,
} from "./state.ts";

const GOAL_STATUS_KEY = "goal";
// Goals are created only through the /goal command. Both model-facing tools
// operate on an existing goal, so they follow its lifecycle.
const GOAL_TOOL_NAMES = ["get_goal", "update_goal"] as const;
const GOAL_TOOL_NAME_SET: ReadonlySet<string> = new Set(GOAL_TOOL_NAMES);
const HIDDEN_TRANSITIONS = new Set(["retry", "progress", "intervention"]);

interface LogicalGoalRun {
  goalId: string;
  cancelledByControl: boolean;
}

interface RetryWait {
  token: ContinuationToken;
  deadline: number;
  timeout: NodeJS.Timeout;
  ticker: NodeJS.Timeout;
}

function safeIncrement(value: number): number {
  return value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;
}

function displayStatus(status: GoalStatus): string {
  return status.replace("_", "-");
}

function transitionText(data: GoalStateEntryData): string | undefined {
  if (HIDDEN_TRANSITIONS.has(data.transition.kind)) return undefined;
  const objective = data.transition.objective ?? data.state?.objective;
  const suffix = data.transition.message ? `\n${data.transition.message}` : "";
  switch (data.transition.kind) {
    case "created":
      return `Goal active\n${objective ?? ""}`;
    case "edited":
      return `Goal edited\n${objective ?? ""}`;
    case "paused":
      return `Goal paused${suffix}`;
    case "resumed":
      return `Goal resumed\n${objective ?? ""}`;
    case "blocked":
      return `Goal blocked${suffix}`;
    case "usage_limited":
      return `Goal usage-limited${suffix}`;
    case "complete":
      return `Goal complete\n${objective ?? ""}`;
    case "cleared":
      return "Goal cleared";
    default:
      return undefined;
  }
}

function goalSummary(goal: GoalState): string {
  return [
    `Status: ${displayStatus(goal.status)}`,
    `Goal runs: ${goal.goalRuns}`,
    `Blocked-audit runs: ${goal.blockedAuditRuns}`,
    `Reconnect cycles: ${goal.reconnects}`,
    "",
    "Objective:",
    goal.objective,
  ].join("\n");
}

export default function goalExtension(pi: ExtensionAPI): void {
  let goal: GoalState | null = null;
  let config: GoalConfig = { ...DEFAULT_GOAL_CONFIG, additionalRetryPatterns: [] };
  let additionalRetryPatterns: RegExp[] = [];
  let runtimeContext: ExtensionContext | undefined;
  let currentRun: LogicalGoalRun | undefined;
  let lastAssistant: AssistantMessage | undefined;
  let lastRetryAfterMs: number | undefined;
  let retryWait: RetryWait | undefined;
  let deferredStart: NodeJS.Timeout | undefined;
  let continuationQueued = false;
  let unsubscribeTerminalInput: (() => void) | undefined;
  let shuttingDown = false;
  let mutationTail: Promise<void> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function syncGoalToolsVisibility(): void {
    const active = pi.getActiveTools();
    const next = shouldExposeGoalTools(goal)
      ? [...new Set([...active, ...GOAL_TOOL_NAMES])]
      : active.filter((name) => !GOAL_TOOL_NAME_SET.has(name));
    if (next.length !== active.length || next.some((name, index) => name !== active[index])) {
      pi.setActiveTools(next);
    }
  }

  function persist(next: GoalState | null, transition: GoalTransition): void {
    goal = next ? { ...next } : null;
    syncGoalToolsVisibility();
    pi.appendEntry<GoalStateEntryData>(GOAL_STATE_ENTRY, {
      version: GOAL_STATE_VERSION,
      state: goal ? { ...goal } : null,
      transition,
    });
  }

  function updateStatus(ctx = runtimeContext): void {
    if (!ctx || ctx.mode !== "tui") return;
    if (!goal) {
      ctx.ui.setStatus(GOAL_STATUS_KEY, undefined);
      return;
    }
    if (retryWait && canLaunchContinuation(goal, retryWait.token)) {
      const seconds = Math.max(0, Math.ceil((retryWait.deadline - Date.now()) / 1_000));
      ctx.ui.setStatus(GOAL_STATUS_KEY, `goal retry ${goal.reconnects} in ${seconds}s`);
      return;
    }
    ctx.ui.setStatus(GOAL_STATUS_KEY, `goal ${displayStatus(goal.status)}`);
  }

  function clearDeferredStart(): void {
    if (deferredStart) clearTimeout(deferredStart);
    deferredStart = undefined;
  }

  function clearRetryWait(update = true): void {
    if (retryWait) {
      clearTimeout(retryWait.timeout);
      clearInterval(retryWait.ticker);
    }
    retryWait = undefined;
    if (update) updateStatus();
  }

  function invalidateScheduledWork(): void {
    clearDeferredStart();
    clearRetryWait(false);
    continuationQueued = false;
    updateStatus();
  }

  function queueGoalRun(ctx: ExtensionContext, token: ContinuationToken): void {
    if (shuttingDown || ctx.mode !== "tui" || !ctx.sessionManager.isPersisted()) return;
    if (!canLaunchContinuation(goal, token) || continuationQueued || !ctx.isIdle()) return;
    continuationQueued = true;
    try {
      pi.sendMessage(
        {
          customType: "pi-goal-continuation",
          content: GOAL_CONTINUATION_TRIGGER,
          display: false,
          details: { goalId: token.goalId, generation: token.generation },
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    } catch (error) {
      continuationQueued = false;
      ctx.ui.notify(`Could not continue goal: ${String(error)}`, "error");
    }
  }

  function deferGoalRun(ctx: ExtensionContext, token: ContinuationToken): void {
    clearDeferredStart();
    deferredStart = setTimeout(() => {
      deferredStart = undefined;
      void exclusive(() => queueGoalRun(ctx, token));
    }, 0);
  }

  function scheduleRetry(ctx: ExtensionContext, token: ContinuationToken, delayMs: number): void {
    clearRetryWait(false);
    const deadline = Date.now() + delayMs;
    let wait: RetryWait;
    const timeout = setTimeout(() => {
      if (retryWait !== wait || !canLaunchContinuation(goal, wait.token)) return;
      clearInterval(wait.ticker);
      retryWait = undefined;
      void exclusive(() => {
        updateStatus(ctx);
        if (canLaunchContinuation(goal, wait.token)) queueGoalRun(ctx, wait.token);
      });
    }, delayMs);
    const ticker = setInterval(() => {
      if (retryWait !== wait || !canLaunchContinuation(goal, wait.token)) {
        clearTimeout(wait.timeout);
        clearInterval(wait.ticker);
        if (retryWait === wait) retryWait = undefined;
        return;
      }
      updateStatus(ctx);
    }, 1_000);
    wait = { token, deadline, timeout, ticker };
    retryWait = wait;
    updateStatus(ctx);
  }

  async function loadConfig(ctx: ExtensionContext): Promise<void> {
    const loaded = await loadGoalConfig(join(getAgentDir(), "goal.json"));
    config = loaded.config;
    additionalRetryPatterns = loaded.patterns;
    for (const warning of loaded.warnings) ctx.ui.notify(warning, "warning");
  }

  function requireTui(ctx: ExtensionContext): boolean {
    if (ctx.mode === "tui") return true;
    ctx.ui.notify("/goal is supported only in interactive TUI mode.", "error");
    return false;
  }

  function requirePersisted(ctx: ExtensionContext): boolean {
    if (ctx.sessionManager.isPersisted()) return true;
    ctx.ui.notify("Goals require a persisted session. Restart Pi without --no-session.", "error");
    return false;
  }

  function markCurrentRunCancelled(): void {
    if (currentRun) currentRun.cancelledByControl = true;
  }

  function pauseActiveGoal(ctx: ExtensionContext, message?: string): void {
    if (!goal || goal.status !== "active") return;
    invalidateScheduledWork();
    markCurrentRunCancelled();
    const next = evolveGoalState(goal, { status: "paused", retrySequence: 0 });
    persist(next, { kind: "paused", status: "paused", objective: next.objective, message });
    updateStatus(ctx);
    if (!ctx.isIdle()) ctx.abort();
  }

  function startNewGoal(objective: string, ctx: ExtensionContext): void {
    invalidateScheduledWork();
    if (goal && goal.status === "active") markCurrentRunCancelled();
    if (!ctx.isIdle()) ctx.abort();
    const next = createGoalState(randomUUID(), objective);
    persist(next, { kind: "created", status: "active", objective });
    updateStatus(ctx);
    if (ctx.isIdle()) deferGoalRun(ctx, makeContinuationToken(next));
  }

  async function handleCreateCommand(objectiveInput: string, ctx: ExtensionContext): Promise<void> {
    if (!requirePersisted(ctx)) return;
    const validation = validateObjective(objectiveInput);
    if (!validation.ok || !validation.objective) {
      ctx.ui.notify(validation.error ?? "Invalid goal objective.", "error");
      return;
    }

    const existing = goal;
    if (existing && existing.status !== "complete") {
      const replace = await ctx.ui.confirm(
        "Replace goal?",
        `Replace the ${displayStatus(existing.status)} goal with:\n\n${validation.objective}`,
      );
      if (!replace) return;
    }

    await exclusive(() => {
      if (existing && goal?.id !== existing.id) {
        ctx.ui.notify("Goal changed while replacement was being confirmed. Try again.", "warning");
        return;
      }
      startNewGoal(validation.objective!, ctx);
    });
  }

  async function handleEditCommand(ctx: ExtensionContext): Promise<void> {
    const selected = goal;
    if (!selected) {
      ctx.ui.notify("No goal is currently set.", "warning");
      return;
    }
    const edited = await ctx.ui.editor("Edit goal objective", selected.objective);
    if (edited === undefined) return;
    const validation = validateObjective(edited);
    if (!validation.ok || !validation.objective) {
      ctx.ui.notify(validation.error ?? "Invalid goal objective.", "error");
      return;
    }

    await exclusive(() => {
      if (!goal || goal.id !== selected.id) {
        ctx.ui.notify("Goal changed while the editor was open. Try again.", "warning");
        return;
      }
      const wasActive = goal.status === "active";
      const wasBusy = !ctx.isIdle();
      invalidateScheduledWork();
      const next = evolveGoalState(goal, { objective: validation.objective!, blockedAuditRuns: 0, retrySequence: 0 });
      persist(next, { kind: "edited", status: next.status, objective: next.objective });
      updateStatus(ctx);
      if (!wasActive) return;
      if (wasBusy) {
        pi.sendMessage(
          { customType: "pi-goal-objective-updated", content: OBJECTIVE_UPDATED_STEERING, display: false },
          { deliverAs: "steer" },
        );
      } else {
        deferGoalRun(ctx, makeContinuationToken(next));
      }
    });
  }

  async function handlePauseCommand(ctx: ExtensionContext): Promise<void> {
    await exclusive(() => {
      if (!goal) {
        ctx.ui.notify("No goal is currently set.", "warning");
        return;
      }
      if (goal.status !== "active") {
        ctx.ui.notify(`Goal is already ${displayStatus(goal.status)}.`, "info");
        return;
      }
      pauseActiveGoal(ctx, "Paused by user.");
    });
  }

  async function handleResumeCommand(ctx: ExtensionContext): Promise<void> {
    await exclusive(() => {
      if (!goal) {
        ctx.ui.notify("No goal is currently set.", "warning");
        return;
      }
      if (goal.status === "complete") {
        ctx.ui.notify("Completed goals cannot be resumed. Create a new goal instead.", "warning");
        return;
      }
      if (goal.status === "active") {
        ctx.ui.notify("Goal is already active.", "info");
        return;
      }
      invalidateScheduledWork();
      const next = evolveGoalState(goal, { status: "active", blockedAuditRuns: 0, retrySequence: 0 });
      persist(next, { kind: "resumed", status: "active", objective: next.objective });
      updateStatus(ctx);
      if (ctx.isIdle()) deferGoalRun(ctx, makeContinuationToken(next));
    });
  }

  async function handleClearCommand(ctx: ExtensionContext): Promise<void> {
    const selected = goal;
    if (!selected) {
      ctx.ui.notify("No goal is currently set.", "info");
      return;
    }
    const clear = await ctx.ui.confirm("Clear goal?", `Clear the ${displayStatus(selected.status)} goal?`);
    if (!clear) return;

    await exclusive(() => {
      if (!goal || goal.id !== selected.id) {
        ctx.ui.notify("Goal changed while clear was being confirmed. Try again.", "warning");
        return;
      }
      invalidateScheduledWork();
      markCurrentRunCancelled();
      persist(null, {
        kind: "cleared",
        status: selected.status,
        objective: selected.objective,
      });
      updateStatus(ctx);
      if (!ctx.isIdle()) ctx.abort();
    });
  }

  async function handleGoalCommand(args: string, ctx: ExtensionContext): Promise<void> {
    if (!requireTui(ctx)) return;
    const input = args.trim();
    if (!input) {
      ctx.ui.notify(goal ? goalSummary(goal) : "No goal is currently set.", "info");
      return;
    }
    switch (input) {
      case "edit":
        await handleEditCommand(ctx);
        return;
      case "pause":
        await handlePauseCommand(ctx);
        return;
      case "resume":
        await handleResumeCommand(ctx);
        return;
      case "clear":
        await handleClearCommand(ctx);
        return;
      default:
        await handleCreateCommand(input, ctx);
    }
  }

  function countTerminalRun(state: GoalState): GoalState {
    return evolveGoalState(state, {
      goalRuns: safeIncrement(state.goalRuns),
      blockedAuditRuns: safeIncrement(state.blockedAuditRuns),
      retrySequence: 0,
    });
  }

  function handleSettled(ctx: ExtensionContext): void {
    const run = currentRun;
    const assistant = lastAssistant;
    currentRun = undefined;
    lastAssistant = undefined;
    continuationQueued = false;

    if (!run) {
      if (goal?.status === "active" && !retryWait) deferGoalRun(ctx, makeContinuationToken(goal));
      return;
    }
    if (!goal || goal.id !== run.goalId) {
      if (goal?.status === "active") deferGoalRun(ctx, makeContinuationToken(goal));
      return;
    }

    if (goal.status === "complete" || goal.status === "blocked") {
      const next = countTerminalRun(goal);
      persist(next, { kind: "progress", status: next.status });
      updateStatus(ctx);
      return;
    }
    if (goal.status !== "active") {
      updateStatus(ctx);
      return;
    }

    if (run.cancelledByControl) {
      deferGoalRun(ctx, makeContinuationToken(goal));
      return;
    }

    if (!assistant) {
      const next = evolveGoalState(goal, { status: "blocked", retrySequence: 0 });
      persist(next, {
        kind: "blocked",
        status: "blocked",
        objective: next.objective,
        message: "Goal run ended without an assistant result.",
      });
      updateStatus(ctx);
      return;
    }

    if (assistant.stopReason === "aborted") {
      pauseActiveGoal(ctx, "Agent run aborted.");
      return;
    }

    if (assistant.stopReason === "error") {
      const disposition = classifyGoalError(assistant.errorMessage, {
        builtinRetryable: isRetryableAssistantError(assistant),
        contextOverflow: isContextOverflow(assistant, ctx.model?.contextWindow ?? 0),
        additionalPatterns: additionalRetryPatterns,
      });
      if (disposition === "retry") {
        const next = evolveGoalState(goal, {
          reconnects: safeIncrement(goal.reconnects),
          retrySequence: safeIncrement(goal.retrySequence),
        });
        persist(next, { kind: "retry", status: "active", message: assistant.errorMessage });
        const delayMs = computeBackoffDelay(next.retrySequence, config, Math.random(), lastRetryAfterMs);
        lastRetryAfterMs = undefined;
        scheduleRetry(ctx, makeContinuationToken(next), delayMs);
        return;
      }

      const status: GoalStatus = disposition === "usage_limited" ? "usage_limited" : "blocked";
      const next = evolveGoalState(goal, { status, retrySequence: 0 });
      persist(next, {
        kind: status,
        status,
        objective: next.objective,
      });
      updateStatus(ctx);
      return;
    }

    const next = evolveGoalState(goal, {
      goalRuns: safeIncrement(goal.goalRuns),
      blockedAuditRuns: safeIncrement(goal.blockedAuditRuns),
      retrySequence: 0,
    });
    persist(next, { kind: "progress", status: "active" });
    updateStatus(ctx);
    deferGoalRun(ctx, makeContinuationToken(next));
  }

  async function restoreSession(event: SessionStartEvent, ctx: ExtensionContext): Promise<void> {
    shuttingDown = false;
    runtimeContext = ctx;
    currentRun = undefined;
    lastAssistant = undefined;
    lastRetryAfterMs = undefined;
    continuationQueued = false;
    invalidateScheduledWork();
    await loadConfig(ctx);
    goal = reconstructGoalState(ctx.sessionManager.getBranch());
    syncGoalToolsVisibility();

    unsubscribeTerminalInput?.();
    unsubscribeTerminalInput = undefined;
    if (ctx.mode === "tui") {
      unsubscribeTerminalInput = ctx.ui.onTerminalInput((data) => {
        const shouldPause =
          goal?.status === "active" &&
          (retryWait !== undefined || !ctx.isIdle()) &&
          (matchesKey(data, "escape") || matchesKey(data, "ctrl+c"));
        if (!shouldPause) return undefined;
        void exclusive(() => pauseActiveGoal(ctx, "Paused by keyboard interrupt."));
        return { consume: true };
      });
    }

    if (event.reason === "fork" && goal?.status === "active") {
      const next = evolveGoalState(goal, { status: "paused", retrySequence: 0 });
      persist(next, {
        kind: "paused",
        status: "paused",
        objective: next.objective,
        message: "Paused after fork/clone because conversation history changed without rolling back the worktree.",
      });
    }
    updateStatus(ctx);
    if (goal?.status === "active" && ctx.mode === "tui" && ctx.sessionManager.isPersisted()) {
      deferGoalRun(ctx, makeContinuationToken(goal));
    }
  }

  pi.registerEntryRenderer<GoalStateEntryData>(GOAL_STATE_ENTRY, (entry, _options, theme) => {
    const text = entry.data ? transitionText(entry.data) : undefined;
    if (!text) return undefined;
    const status = entry.data?.transition.kind;
    const color = status === "complete" ? "success" : status === "blocked" || status === "usage_limited" ? "error" : status === "paused" ? "warning" : "accent";
    return new Text(theme.fg(color, text), 1, 0);
  });

  pi.registerCommand("goal", {
    description: "Create, inspect, edit, pause, resume, or clear a persistent goal",
    getArgumentCompletions(prefix) {
      const commands = ["edit", "pause", "resume", "clear"];
      const matches = commands.filter((command) => command.startsWith(prefix));
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: handleGoalCommand,
  });

  pi.registerTool({
    name: "get_goal",
    label: "Get Goal",
    description: GET_GOAL_DESCRIPTION,
    promptSnippet: "Read the persistent goal attached to the current Pi session branch",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: JSON.stringify({ goal }, null, 2) }],
        details: { goal: goal ? { ...goal } : null },
      };
    },
  });

  pi.registerTool({
    name: "update_goal",
    label: "Update Goal",
    description: UPDATE_GOAL_DESCRIPTION,
    promptSnippet: "Mark the active persistent goal complete or genuinely blocked",
    parameters: Type.Object(
      { status: StringEnum(["complete", "blocked"] as const) },
      { additionalProperties: false },
    ),
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (ctx.mode !== "tui") throw new Error("Goals are supported only in interactive TUI mode.");
      return exclusive(() => {
        const status = params.status as ModelGoalStatus;
        const allowed = canModelUpdateGoal(goal, status);
        if (!allowed.ok || !goal) throw new Error(allowed.error ?? "Goal update rejected.");
        invalidateScheduledWork();
        const next = evolveGoalState(goal, { status, retrySequence: 0 });
        persist(next, { kind: status, status, objective: next.objective });
        updateStatus(ctx);
        return {
          content: [{ type: "text", text: `Goal marked ${status}.` }],
          details: { goal: { ...next } },
        };
      });
    },
  });

  pi.on("session_start", (event, ctx) => exclusive(() => restoreSession(event, ctx)));

  pi.on("session_shutdown", async (_event, ctx) => {
    shuttingDown = true;
    invalidateScheduledWork();
    unsubscribeTerminalInput?.();
    unsubscribeTerminalInput = undefined;
    ctx.ui.setStatus(GOAL_STATUS_KEY, undefined);
    runtimeContext = undefined;
  });

  pi.on("session_before_switch", async () => {
    shuttingDown = true;
    invalidateScheduledWork();
  });

  pi.on("session_before_fork", (_event, ctx) =>
    exclusive(() => {
      if (goal?.status === "active") pauseActiveGoal(ctx, "Paused before fork/clone.");
    }),
  );

  pi.on("session_before_tree", (_event, ctx) =>
    exclusive(() => {
      if (goal?.status === "active") pauseActiveGoal(ctx, "Paused before tree navigation.");
    }),
  );

  pi.on("session_tree", (_event, ctx) =>
    exclusive(() => {
      invalidateScheduledWork();
      goal = reconstructGoalState(ctx.sessionManager.getBranch());
      syncGoalToolsVisibility();
      if (goal?.status === "active") {
        const next = evolveGoalState(goal, { status: "paused", retrySequence: 0 });
        persist(next, {
          kind: "paused",
          status: "paused",
          objective: next.objective,
          message: "Paused after tree navigation because conversation history changed without rolling back the worktree.",
        });
      }
      updateStatus(ctx);
    }),
  );

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    await exclusive(() => {
      if (goal?.status !== "active") return;
      if (!retryWait) {
        if (deferredStart) {
          clearDeferredStart();
          continuationQueued = false;
        }
        return;
      }
      invalidateScheduledWork();
      const next = evolveGoalState(goal, { retrySequence: 0 });
      persist(next, { kind: "intervention", status: "active", message: "Retry wait reset by user steering." });
      updateStatus(ctx);
    });
  });

  pi.on("model_select", (_event, ctx) =>
    exclusive(() => {
      if (goal?.status !== "active") return;
      if (!retryWait) {
        if (deferredStart) {
          clearDeferredStart();
          continuationQueued = false;
          if (ctx.isIdle()) deferGoalRun(ctx, makeContinuationToken(goal));
        }
        return;
      }
      invalidateScheduledWork();
      const next = evolveGoalState(goal, { retrySequence: 0 });
      persist(next, { kind: "intervention", status: "active", message: "Retry wait reset by model change." });
      updateStatus(ctx);
      deferGoalRun(ctx, makeContinuationToken(next));
    }),
  );

  pi.on("before_agent_start", (event) => {
    continuationQueued = false;
    clearDeferredStart();
    lastAssistant = undefined;
    lastRetryAfterMs = undefined;
    if (!goal || goal.status !== "active") return;
    currentRun = { goalId: goal.id, cancelledByControl: false };
    return { systemPrompt: `${event.systemPrompt}\n\n${renderGoalPrompt(goal)}` };
  });

  pi.on("after_provider_response", (event) => {
    if (goal?.status !== "active") return;
    const retryAfter = event.headers["retry-after"] ?? event.headers["Retry-After"];
    lastRetryAfterMs = parseRetryAfter(retryAfter);
  });

  pi.on("message_end", (event) => {
    if (event.message.role === "assistant") lastAssistant = event.message as AssistantMessage;
  });

  pi.on("agent_settled", (_event, ctx) => exclusive(() => handleSettled(ctx)));
}
