export const GOAL_STATE_ENTRY = "pi-goal-state";
export const GOAL_STATE_VERSION = 1;
export const MAX_OBJECTIVE_CHARS = 32_000;

export type GoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "complete";
export type ModelGoalStatus = Extract<GoalStatus, "blocked" | "complete">;

export type GoalTransitionKind =
  | "created"
  | "edited"
  | "paused"
  | "resumed"
  | "blocked"
  | "usage_limited"
  | "complete"
  | "cleared"
  | "retry"
  | "progress"
  | "intervention";

export interface GoalState {
  id: string;
  objective: string;
  status: GoalStatus;
  goalRuns: number;
  blockedAuditRuns: number;
  reconnects: number;
  retrySequence: number;
  generation: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoalTransition {
  kind: GoalTransitionKind;
  status?: GoalStatus;
  objective?: string;
  message?: string;
}

export interface GoalStateEntryData {
  version: typeof GOAL_STATE_VERSION;
  state: GoalState | null;
  transition: GoalTransition;
}

export interface ContinuationToken {
  goalId: string;
  generation: number;
}

export interface ObjectiveValidation {
  ok: boolean;
  objective?: string;
  error?: string;
}

const GOAL_STATUSES = new Set<GoalStatus>(["active", "paused", "blocked", "usage_limited", "complete"]);
const TRANSITION_KINDS = new Set<GoalTransitionKind>([
  "created",
  "edited",
  "paused",
  "resumed",
  "blocked",
  "usage_limited",
  "complete",
  "cleared",
  "retry",
  "progress",
  "intervention",
]);

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function validateObjective(value: string): ObjectiveValidation {
  const objective = value.trim();
  if (!objective) {
    return { ok: false, error: "Goal objective must not be empty." };
  }
  const length = Array.from(objective).length;
  if (length > MAX_OBJECTIVE_CHARS) {
    return {
      ok: false,
      error: `Goal objective must be at most ${MAX_OBJECTIVE_CHARS.toLocaleString("en-US")} characters; reference a file for larger content.`,
    };
  }
  return { ok: true, objective };
}

export function createGoalState(id: string, objective: string, now = Date.now()): GoalState {
  return {
    id,
    objective,
    status: "active",
    goalRuns: 0,
    blockedAuditRuns: 0,
    reconnects: 0,
    retrySequence: 0,
    generation: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function evolveGoalState(
  state: GoalState,
  patch: Partial<Omit<GoalState, "id" | "createdAt" | "generation" | "updatedAt">>,
  now = Date.now(),
): GoalState {
  return {
    ...state,
    ...patch,
    generation: state.generation + 1,
    updatedAt: now,
  };
}

export function makeContinuationToken(state: GoalState): ContinuationToken {
  return { goalId: state.id, generation: state.generation };
}

export function canLaunchContinuation(state: GoalState | null, token: ContinuationToken): boolean {
  return state?.status === "active" && state.id === token.goalId && state.generation === token.generation;
}

export function canModelUpdateGoal(state: GoalState | null, status: ModelGoalStatus): { ok: boolean; error?: string } {
  if (!state) return { ok: false, error: "Cannot update goal because this session has no goal." };
  if (state.status !== "active") {
    return { ok: false, error: `Cannot mark a ${state.status} goal ${status}. Resume or replace it first.` };
  }
  if (status === "blocked" && state.blockedAuditRuns < 2) {
    return {
      ok: false,
      error: "Cannot mark the goal blocked before the same blocker has persisted through at least three goal runs.",
    };
  }
  return { ok: true };
}

function isGoalState(value: unknown): value is GoalState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<GoalState>;
  return (
    typeof state.id === "string" &&
    state.id.length > 0 &&
    typeof state.objective === "string" &&
    typeof state.status === "string" &&
    GOAL_STATUSES.has(state.status as GoalStatus) &&
    isNonNegativeInteger(state.goalRuns) &&
    isNonNegativeInteger(state.blockedAuditRuns) &&
    isNonNegativeInteger(state.reconnects) &&
    isNonNegativeInteger(state.retrySequence) &&
    isNonNegativeInteger(state.generation) &&
    typeof state.createdAt === "number" &&
    Number.isFinite(state.createdAt) &&
    typeof state.updatedAt === "number" &&
    Number.isFinite(state.updatedAt)
  );
}

export function isGoalStateEntryData(value: unknown): value is GoalStateEntryData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<GoalStateEntryData>;
  if (data.version !== GOAL_STATE_VERSION) return false;
  if (data.state !== null && !isGoalState(data.state)) return false;
  if (!data.transition || typeof data.transition !== "object") return false;
  const transition = data.transition as Partial<GoalTransition>;
  return typeof transition.kind === "string" && TRANSITION_KINDS.has(transition.kind as GoalTransitionKind);
}

export function reconstructGoalState(entries: readonly unknown[]): GoalState | null {
  let state: GoalState | null = null;
  for (const candidate of entries) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as { type?: unknown; customType?: unknown; data?: unknown };
    if (entry.type !== "custom" || entry.customType !== GOAL_STATE_ENTRY) continue;
    if (!isGoalStateEntryData(entry.data)) continue;
    state = entry.data.state ? { ...entry.data.state } : null;
  }
  return state;
}
