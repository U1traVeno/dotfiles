import { readFile } from "node:fs/promises";

export interface GoalConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  additionalRetryPatterns: string[];
}

export interface ParsedGoalConfig {
  config: GoalConfig;
  patterns: RegExp[];
  warnings: string[];
}

export const DEFAULT_GOAL_CONFIG: Readonly<GoalConfig> = Object.freeze({
  baseDelayMs: 2_000,
  maxDelayMs: 60_000,
  jitterRatio: 0.2,
  additionalRetryPatterns: [],
});

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function defaults(warnings: string[] = []): ParsedGoalConfig {
  return { config: { ...DEFAULT_GOAL_CONFIG, additionalRetryPatterns: [] }, patterns: [], warnings };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDelay(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_TIMER_DELAY_MS;
}

export function parseGoalConfig(value: unknown): ParsedGoalConfig {
  if (!isPlainObject(value)) return defaults(["goal.json must contain a JSON object; using defaults."]);

  const baseDelayMs = value.baseDelayMs ?? DEFAULT_GOAL_CONFIG.baseDelayMs;
  const maxDelayMs = value.maxDelayMs ?? DEFAULT_GOAL_CONFIG.maxDelayMs;
  const jitterRatio = value.jitterRatio ?? DEFAULT_GOAL_CONFIG.jitterRatio;
  const additionalRetryPatterns = value.additionalRetryPatterns ?? DEFAULT_GOAL_CONFIG.additionalRetryPatterns;

  const fieldsValid =
    validDelay(baseDelayMs) &&
    validDelay(maxDelayMs) &&
    maxDelayMs >= baseDelayMs &&
    typeof jitterRatio === "number" &&
    Number.isFinite(jitterRatio) &&
    jitterRatio >= 0 &&
    jitterRatio <= 1 &&
    Array.isArray(additionalRetryPatterns) &&
    additionalRetryPatterns.every((pattern) => typeof pattern === "string");

  if (!fieldsValid) {
    return defaults([
      "goal.json has invalid fields; delays must be positive integers with maxDelayMs >= baseDelayMs, jitterRatio must be between 0 and 1, and additionalRetryPatterns must be strings. Using defaults.",
    ]);
  }

  const warnings: string[] = [];
  const acceptedPatterns: string[] = [];
  const patterns: RegExp[] = [];
  for (const source of additionalRetryPatterns as string[]) {
    if (!source.trim()) {
      warnings.push("Ignored an empty additionalRetryPatterns entry.");
      continue;
    }
    try {
      patterns.push(new RegExp(source, "i"));
      acceptedPatterns.push(source);
    } catch (error) {
      warnings.push(`Ignored invalid retry pattern ${JSON.stringify(source)}: ${String(error)}`);
    }
  }

  return {
    config: {
      baseDelayMs: baseDelayMs as number,
      maxDelayMs: maxDelayMs as number,
      jitterRatio: jitterRatio as number,
      additionalRetryPatterns: acceptedPatterns,
    },
    patterns,
    warnings,
  };
}

export async function loadGoalConfig(path: string): Promise<ParsedGoalConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults();
    return defaults([`Could not read ${path}; using defaults: ${String(error)}`]);
  }

  try {
    return parseGoalConfig(JSON.parse(text));
  } catch (error) {
    return defaults([`Could not parse ${path}; using defaults: ${String(error)}`]);
  }
}
