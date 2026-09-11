/**
 * Outcome classification for a subagent child run.
 *
 * The child is a full pi process started with `--mode json`, and pi exits 0
 * even when the model call fails: the failure lives in the assistant message
 * (`stopReason` / `errorMessage`) instead of in the exit code. Reading that
 * stream correctly is the part that used to be wrong — every failed run was
 * reported to the parent as a successful "(no output)" — so it lives here as a
 * pure function with a test next to it.
 *
 * The three terminal situations are deliberately kept apart:
 *
 *   - a positive failure signal (error / length / aborted, non-zero exit, or a
 *     child killed by a signal) is a failure;
 *   - a run that ends cleanly without producing any usable text is also a
 *     failure, but a differently worded one — it finished, it just has nothing
 *     to report, and the parent must not read silence as an answer;
 *   - a run with text is a report.
 */

export interface AssistantTurn {
	stopReason?: string;
	errorMessage?: string;
	/** Concatenated text parts, or null when the turn carried no text part. */
	text: string | null;
	toolCalls: string[];
}

export interface ChildRun {
	turns: AssistantTurn[];
	stderr: string;
	/** null when the child was terminated by a signal. */
	exitCode: number | null;
	killedBy: string | null;
	aborted: boolean;
}

export type ChildOutcome =
	| { kind: "report"; text: string }
	| { kind: "failure"; message: string };

/** Summarize one `message_end` payload. Returns null for non-assistant messages. */
export function assistantTurn(message: unknown): AssistantTurn | null {
	if (!message || typeof message !== "object") return null;
	const msg = message as {
		role?: string;
		content?: unknown;
		stopReason?: string;
		errorMessage?: string;
	};
	if (msg.role !== "assistant") return null;

	const content = Array.isArray(msg.content) ? msg.content : [];
	const texts: string[] = [];
	const toolCalls: string[] = [];
	for (const raw of content) {
		const part = raw as { type?: unknown; text?: unknown; name?: unknown };
		if (part?.type === "text")
			texts.push(typeof part.text === "string" ? part.text : "");
		else if (part?.type === "toolCall" && typeof part.name === "string")
			toolCalls.push(part.name);
	}

	return {
		stopReason: msg.stopReason,
		errorMessage: msg.errorMessage,
		text: texts.length > 0 ? texts.join("") : null,
		toolCalls,
	};
}

/**
 * The newest turn that actually said something. Mid-run turns carry tool calls
 * and no text at all, which is normal and must not be mistaken for an answer.
 */
function usableText(turns: AssistantTurn[]): string | null {
	for (let i = turns.length - 1; i >= 0; i--) {
		const text = turns[i].text;
		if (text !== null && text.trim() !== "") return text;
	}
	return null;
}

/** The reason the child stopped, when it stopped for a bad reason. */
function terminalFailure(turns: AssistantTurn[]): string | null {
	for (const turn of turns) {
		if (turn.stopReason === "error") {
			return turn.errorMessage || "Model request failed (stopReason: error).";
		}
	}
	for (const turn of turns) {
		if (turn.stopReason === "length") {
			return "Model hit the output token limit before producing a final answer (stopReason: length).";
		}
		if (turn.stopReason === "aborted") {
			return "Subagent run was aborted (stopReason: aborted).";
		}
	}
	return null;
}

export function decideOutcome(run: ChildRun): ChildOutcome {
	const text = usableText(run.turns);
	const partial = text
		? `\n\n--- partial output before the failure ---\n${text}`
		: "";
	const stderrDetail = run.stderr ? `\n\nstderr:\n${run.stderr}` : "";
	const failure = (message: string): ChildOutcome => ({
		kind: "failure",
		message: `${message}${partial}${stderrDetail}`,
	});

	if (run.aborted) return failure("Subagent aborted.");
	if (run.killedBy)
		return failure(`Subagent process was killed by ${run.killedBy}.`);
	if (run.exitCode !== 0)
		return failure(`Subagent exited with code ${run.exitCode}.`);

	const signal = terminalFailure(run.turns);
	if (signal) return failure(signal);
	if (text) return { kind: "report", text };

	const tools = run.turns.flatMap((turn) => turn.toolCalls);
	const toolsUsed = tools.length > 0 ? [...new Set(tools)].join(", ") : "none";
	const lastStopReason = run.turns.at(-1)?.stopReason ?? "unknown";
	return failure(
		`Subagent finished cleanly without producing a report: ${run.turns.length} assistant turn(s), ` +
			`tools used: ${toolsUsed}, last stopReason: ${lastStopReason}.`,
	);
}
