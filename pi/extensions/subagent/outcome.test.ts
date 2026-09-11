import assert from "node:assert/strict";
import test from "node:test";

import {
	type AssistantTurn,
	type ChildRun,
	assistantTurn,
	decideOutcome,
} from "./outcome.ts";

function run(overrides: Partial<ChildRun> = {}): ChildRun {
	return {
		turns: [],
		stderr: "",
		exitCode: 0,
		killedBy: null,
		aborted: false,
		...overrides,
	};
}

function turn(overrides: Partial<AssistantTurn> = {}): AssistantTurn {
	return { text: null, toolCalls: [], stopReason: "stop", ...overrides };
}

function textOf(run: ChildRun): string {
	const outcome = decideOutcome(run);
	assert.equal(outcome.kind, "failure", "expected a failure outcome");
	return outcome.kind === "failure" ? outcome.message : "";
}

test("assistantTurn ignores messages that are not assistant turns", () => {
	assert.equal(assistantTurn(undefined), null);
	assert.equal(assistantTurn(null), null);
	assert.equal(assistantTurn("nope"), null);
	assert.equal(
		assistantTurn({ role: "user", content: [{ type: "text", text: "hi" }] }),
		null,
	);
	assert.equal(assistantTurn({ role: "toolResult", content: [] }), null);
});

test("assistantTurn separates empty text from missing text", () => {
	const withText = assistantTurn({
		role: "assistant",
		content: [{ type: "text", text: "answer" }],
		stopReason: "stop",
	});
	assert.equal(withText?.text, "answer");

	const withoutTextPart = assistantTurn({
		role: "assistant",
		content: [{ type: "toolCall", name: "read" }],
		stopReason: "toolUse",
	});
	assert.equal(withoutTextPart?.text, null);
	assert.deepEqual(withoutTextPart?.toolCalls, ["read"]);

	const blankText = assistantTurn({
		role: "assistant",
		content: [{ type: "text", text: "   " }],
		stopReason: "stop",
	});
	assert.equal(blankText?.text, "   ");
});

test("a run whose last turn has text is a report", () => {
	const outcome = decideOutcome(run({ turns: [turn({ text: "REPORT-OK" })] }));
	assert.deepEqual(outcome, { kind: "report", text: "REPORT-OK" });
});

test("mid-run tool turns carry no text and are not an answer", () => {
	const outcome = decideOutcome(
		run({
			turns: [
				turn({ stopReason: "toolUse", toolCalls: ["read", "bash"] }),
				turn({ stopReason: "toolUse", toolCalls: ["read"] }),
				turn({ text: "final report" }),
			],
		}),
	);
	assert.deepEqual(outcome, { kind: "report", text: "final report" });
});

test("a clean run with no text at all is a failure, not an empty answer", () => {
	const message = textOf(run({ turns: [turn({ text: null })] }));
	assert.match(message, /finished cleanly without producing a report/);
	assert.match(message, /last stopReason: stop/);
});

test("blank text is not a report", () => {
	const message = textOf(run({ turns: [turn({ text: "  \n " })] }));
	assert.match(message, /finished cleanly without producing a report/);
});

test("the no-report failure names the tools that were used", () => {
	const message = textOf(
		run({
			turns: [
				turn({
					text: null,
					stopReason: "toolUse",
					toolCalls: ["read", "read", "grep"],
				}),
			],
		}),
	);
	assert.match(message, /tools used: read, grep/);
});

test("a provider error reports the child's errorMessage", () => {
	const message = textOf(
		run({
			turns: [
				turn({ text: null, stopReason: "error", errorMessage: "provider 429" }),
			],
		}),
	);
	assert.match(message, /provider 429/);
});

test("a provider error without an errorMessage still reports a failure", () => {
	const message = textOf(
		run({ turns: [turn({ text: null, stopReason: "error" })] }),
	);
	assert.match(message, /stopReason: error/);
});

test("a length stop keeps the partial output and says it was truncated", () => {
	const message = textOf(
		run({
			turns: [
				turn({ text: "Partial report: I inspected three", stopReason: "length" }),
			],
		}),
	);
	assert.match(message, /output token limit/);
	assert.match(message, /partial output before the failure/);
	assert.match(message, /Partial report: I inspected three/);
});

test("an aborted run is a failure", () => {
	const message = textOf(
		run({ turns: [turn({ text: "half" })], aborted: true }),
	);
	assert.match(message, /Subagent aborted/);
});

test("a child killed by a signal is a failure even though its exit code is null", () => {
	const message = textOf(
		run({ turns: [], exitCode: null, killedBy: "SIGTERM" }),
	);
	assert.match(message, /killed by SIGTERM/);
});

test("a non-zero exit surfaces the child's stderr", () => {
	const message = textOf(run({ exitCode: 2, stderr: "boom" }));
	assert.match(message, /exited with code 2/);
	assert.match(message, /boom/);
});

test("stderr is attached to failures but not to reports", () => {
	const noisy = "✓ Markdown clean · 9921ms";
	assert.deepEqual(
		decideOutcome(run({ turns: [turn({ text: "ok" })], stderr: noisy })),
		{
			kind: "report",
			text: "ok",
		},
	);
	assert.match(
		textOf(run({ turns: [turn({ text: null })], stderr: noisy })),
		/Markdown clean/,
	);
});

test("no failure outcome is ever a bare empty string", () => {
	const cases: ChildRun[] = [
		run(),
		run({ turns: [turn({ text: null })] }),
		run({ turns: [turn({ text: "   " })] }),
		run({ turns: [turn({ text: null, stopReason: "error" })] }),
		run({ exitCode: null, killedBy: "SIGKILL" }),
		run({ aborted: true }),
		run({ exitCode: 1 }),
	];
	for (const childRun of cases) {
		const message = textOf(childRun);
		assert.notEqual(message.trim(), "");
		assert.notEqual(message, "(no output)");
	}
});
