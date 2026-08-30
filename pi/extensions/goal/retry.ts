import type { GoalConfig } from "./config.ts";

export type GoalErrorDisposition = "retry" | "usage_limited" | "context_overflow" | "blocked";

const USAGE_LIMIT_PATTERN =
  /GoUsageLimitError|FreeUsageLimitError|usage limit|monthly usage limit|insufficient_quota|quota exceeded|out of budget|billing|credit balance|available balance/i;

export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export function computeBackoffDelay(
  attempt: number,
  config: Pick<GoalConfig, "baseDelayMs" | "maxDelayMs" | "jitterRatio">,
  random = Math.random(),
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(config.maxDelayMs, Math.round(retryAfterMs));
  }

  const normalizedAttempt = Math.max(1, Number.isFinite(attempt) ? Math.floor(attempt) : 1);
  const exponent = Math.min(normalizedAttempt - 1, 52);
  const exponential = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
  const boundedRandom = Math.min(1, Math.max(0, random));
  const jitterFactor = 1 + (boundedRandom * 2 - 1) * config.jitterRatio;
  return Math.min(config.maxDelayMs, Math.max(0, Math.round(exponential * jitterFactor)));
}

export function classifyGoalError(
  errorMessage: string | undefined,
  options: {
    builtinRetryable: boolean;
    contextOverflow: boolean;
    additionalPatterns: readonly RegExp[];
  },
): GoalErrorDisposition {
  const message = errorMessage ?? "";
  if (options.contextOverflow) return "context_overflow";
  if (USAGE_LIMIT_PATTERN.test(message)) return "usage_limited";
  if (options.builtinRetryable) return "retry";
  if (message && options.additionalPatterns.some((pattern) => pattern.test(message))) return "retry";
  return "blocked";
}
