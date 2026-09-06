import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_GOAL_CONFIG, parseGoalConfig } from "./config.ts";
import { renderGoalPrompt } from "./prompts.ts";
import { classifyGoalError, computeBackoffDelay, parseRetryAfter } from "./retry.ts";
import {
  GOAL_STATE_ENTRY,
  MAX_OBJECTIVE_CHARS,
  canLaunchContinuation,
  canModelUpdateGoal,
  createGoalState,
  evolveGoalState,
  makeContinuationToken,
  reconstructGoalState,
  shouldExposeGoalTools,
  validateObjective,
} from "./state.ts";

test("objective validation trims boundaries and enforces the Unicode character limit", () => {
  assert.deepEqual(validateObjective("  ship it  "), { ok: true, objective: "ship it" });
  assert.equal(validateObjective("   ").ok, false);
  assert.equal(validateObjective("x".repeat(MAX_OBJECTIVE_CHARS)).ok, true);
  assert.equal(validateObjective("😀".repeat(MAX_OBJECTIVE_CHARS)).ok, true);
  assert.equal(validateObjective("x".repeat(MAX_OBJECTIVE_CHARS + 1)).ok, false);
});

test("goal tools are exposed only while a non-complete goal exists", () => {
  assert.equal(shouldExposeGoalTools(null), false);

  const goal = createGoalState("goal-1", "finish", 100);
  for (const status of ["active", "paused", "blocked", "usage_limited"] as const) {
    assert.equal(shouldExposeGoalTools(evolveGoalState(goal, { status }, 101)), true);
  }
  assert.equal(shouldExposeGoalTools(evolveGoalState(goal, { status: "complete" }, 101)), false);
});

test("model terminal transitions require an active goal and enforce the blocked run threshold", () => {
  const goal = createGoalState("goal-1", "finish", 100);
  assert.equal(canModelUpdateGoal(goal, "complete").ok, true);
  assert.equal(canModelUpdateGoal(goal, "blocked").ok, false);
  assert.equal(canModelUpdateGoal(evolveGoalState(goal, { blockedAuditRuns: 2 }, 101), "blocked").ok, true);
  assert.equal(canModelUpdateGoal(evolveGoalState(goal, { status: "paused" }, 101), "complete").ok, false);
  assert.equal(canModelUpdateGoal(null, "complete").ok, false);
});

test("branch reconstruction uses the latest valid state entry and honors clear", () => {
  const first = createGoalState("goal-1", "first", 100);
  const second = evolveGoalState(first, { objective: "second" }, 101);
  const entries = [
    { type: "custom", customType: GOAL_STATE_ENTRY, data: { version: 1, state: first, transition: { kind: "created" } } },
    { type: "message", message: { role: "user", content: "ignored" } },
    { type: "custom", customType: GOAL_STATE_ENTRY, data: { version: 1, state: second, transition: { kind: "edited" } } },
  ];
  assert.equal(reconstructGoalState(entries)?.objective, "second");

  entries.push({
    type: "custom",
    customType: GOAL_STATE_ENTRY,
    data: { version: 1, state: null, transition: { kind: "cleared" } },
  });
  assert.equal(reconstructGoalState(entries), null);
});

test("continuation tokens reject paused, replaced, and stale generations", () => {
  const goal = createGoalState("goal-1", "finish", 100);
  const token = makeContinuationToken(goal);
  assert.equal(canLaunchContinuation(goal, token), true);
  assert.equal(canLaunchContinuation(evolveGoalState(goal, { status: "paused" }, 101), token), false);
  assert.equal(canLaunchContinuation(createGoalState("goal-2", "other", 101), token), false);
  assert.equal(canLaunchContinuation(null, token), false);
});

test("config parser accepts valid fields and isolates invalid regex entries", () => {
  const parsed = parseGoalConfig({
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    jitterRatio: 0.1,
    additionalRetryPatterns: ["upstream exploded", "[", ""],
  });
  assert.equal(parsed.config.baseDelayMs, 1_000);
  assert.deepEqual(parsed.config.additionalRetryPatterns, ["upstream exploded"]);
  assert.equal(parsed.patterns.length, 1);
  assert.equal(parsed.warnings.length, 2);
});

test("invalid config fields fall back as one unit", () => {
  const parsed = parseGoalConfig({ baseDelayMs: 5_000, maxDelayMs: 1_000, jitterRatio: 2 });
  assert.deepEqual(parsed.config, DEFAULT_GOAL_CONFIG);
  assert.equal(parsed.patterns.length, 0);
  assert.equal(parsed.warnings.length, 1);
});

test("backoff applies jitter, caps safely, and prefers Retry-After", () => {
  const config = { baseDelayMs: 2_000, maxDelayMs: 60_000, jitterRatio: 0.2 };
  assert.equal(computeBackoffDelay(1, config, 0), 1_600);
  assert.equal(computeBackoffDelay(1, config, 1), 2_400);
  assert.equal(computeBackoffDelay(Number.MAX_SAFE_INTEGER, config, 1), 60_000);
  assert.equal(computeBackoffDelay(3, config, 0.5, 120_000), 60_000);
  assert.equal(parseRetryAfter("1.5"), 1_500);
  assert.equal(parseRetryAfter("not-a-date"), undefined);
});

test("error classification protects usage and context errors before additive retry patterns", () => {
  const broadPattern = [/.*/i];
  assert.equal(
    classifyGoalError("insufficient_quota", {
      builtinRetryable: false,
      contextOverflow: false,
      additionalPatterns: broadPattern,
    }),
    "usage_limited",
  );
  assert.equal(
    classifyGoalError("maximum context length exceeded", {
      builtinRetryable: false,
      contextOverflow: true,
      additionalPatterns: broadPattern,
    }),
    "context_overflow",
  );
  assert.equal(
    classifyGoalError("503 service unavailable", {
      builtinRetryable: true,
      contextOverflow: false,
      additionalPatterns: [],
    }),
    "retry",
  );
  assert.equal(
    classifyGoalError("vendor temporarily asleep", {
      builtinRetryable: false,
      contextOverflow: false,
      additionalPatterns: [/temporarily asleep/i],
    }),
    "retry",
  );
  assert.equal(
    classifyGoalError("invalid model", {
      builtinRetryable: false,
      contextOverflow: false,
      additionalPatterns: [],
    }),
    "blocked",
  );
});

test("prompt distinguishes the first run and preserves completion safeguards", () => {
  const first = renderGoalPrompt(createGoalState("goal-1", "make it true", 100));
  assert.match(first, /This is the first goal run/);
  assert.match(first, /<objective>\nmake it true\n<\/objective>/);
  assert.match(first, /Transient provider or transport failures/);
  assert.match(first, /Only mark the goal achieved when current evidence proves every requirement/);

  const later = renderGoalPrompt(evolveGoalState(createGoalState("goal-1", "make it true", 100), { goalRuns: 2 }, 101));
  assert.match(later, /Classify the previous valid goal run/);
  assert.doesNotMatch(later, /This is the first goal run/);
});
