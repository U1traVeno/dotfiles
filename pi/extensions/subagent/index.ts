/**
 * Subagent extension.
 *
 * Delegates a task to a fresh pi process with an isolated context window, and
 * optionally preloads skills via `--skill`.
 *
 * This is a local fork of `@jerryan/pi-subagent-lite` (MIT, by jerryan; see
 * ./LICENSE). The upstream version reported every child run as "the child's
 * last text, or the string `(no output)`", with `isError` unset. Because pi
 * exits 0 even when a model call fails — the failure is carried in the
 * assistant message's `stopReason` / `errorMessage` — every kind of child
 * failure (provider error
 * after retries, exhausted output limit, a killed process, a clean run that
 * said nothing) collapsed into the same silent, successful-looking empty
 * result. The parent agent then had no way to tell "the subagent found nothing"
 * from "the subagent never ran".
 *
 * Classification now lives in ./outcome.ts, which is pure and tested.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
	type AgentToolResult,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";

import {
	type AssistantTurn,
	type ChildRun,
	assistantTurn,
	decideOutcome,
} from "./outcome.ts";

const MAX_TASK_ARG_LENGTH = 4000;

/**
 * Set on the child so a subagent cannot spawn subagents. Kept at the upstream
 * name so a child started by either implementation stays disabled during the
 * transition away from the npm package.
 */
const NESTING_GUARD = "PI_SUBAGENT_LITE_DISABLE";

const MINIMAL_SYSTEM_PROMPT = `You are a subagent running in an isolated pi process with access to file system and shell tools.

Your job is to focus exclusively on the assigned task, use tools as needed, and provide a clear, concise report or summary at the end.

Guidelines:
- Stay focused on the task. Do not drift into unrelated work.
- Be concise, but include enough detail for the parent agent to act on your findings.
- End with a clear summary or conclusion.`;

type OnUpdate = (result: AgentToolResult) => void;

interface ExitOutcome {
	code: number | null;
	killedBy: NodeJS.Signals | null;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

function summarizeTools(turn: AssistantTurn): string | null {
	if (turn.toolCalls.length === 0) return null;
	const counts = new Map<string, number>();
	for (const name of turn.toolCalls)
		counts.set(name, (counts.get(name) ?? 0) + 1);
	return [...counts]
		.map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
		.join(", ");
}

/**
 * Fold the child's `--mode json` stream into `run`.
 * Returns a flush for the trailing partial line, to be called once the child closes.
 */
function consumeChildStream(
	proc: ChildProcess,
	run: ChildRun,
	onUpdate?: OnUpdate,
): () => void {
	let buffer = "";

	const handleLine = (line: string) => {
		if (!line.trim()) return;
		let event: { type?: string; message?: unknown };
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type !== "message_end") return;

		const turn = assistantTurn(event.message);
		if (!turn) return;
		run.turns.push(turn);

		if (onUpdate) {
			const text = turn.text ?? "";
			let update = `Turn ${run.turns.length}: ${summarizeTools(turn) ?? "thinking..."}`;
			if (text)
				update += `\n${text.length > 60 ? `${text.slice(0, 60)}...` : text}`;
			onUpdate({ content: [{ type: "text", text: update }] });
		}
	};

	proc.stdout?.on("data", (data: Buffer) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) handleLine(line);
	});

	proc.stderr?.on("data", (data: Buffer) => {
		run.stderr += data.toString();
	});

	return () => {
		if (buffer.trim()) handleLine(buffer);
	};
}

/** Resolve when the child exits, escalating SIGTERM to SIGKILL on abort. */
function awaitChildExit(
	proc: ChildProcess,
	signal: AbortSignal | undefined,
	flush: () => void,
): Promise<ExitOutcome> {
	return new Promise<ExitOutcome>((resolve) => {
		let killTimer: NodeJS.Timeout | null = null;

		const onAbort = () => {
			proc.kill("SIGTERM");
			killTimer = setTimeout(() => {
				// `proc.killed` flips as soon as kill() is called, so ask the
				// process itself whether it is actually gone.
				if (proc.exitCode === null && proc.signalCode === null)
					proc.kill("SIGKILL");
			}, 5000);
		};

		if (signal?.aborted) {
			onAbort();
		} else {
			signal?.addEventListener("abort", onAbort, { once: true });
		}

		const done = (code: number | null, killedBy: NodeJS.Signals | null) => {
			signal?.removeEventListener("abort", onAbort);
			if (killTimer) clearTimeout(killTimer);
			flush();
			resolve({ code, killedBy });
		};

		proc.on("close", done);
		proc.on("error", () => done(1, null));
	});
}

async function runSubagent(
	cwd: string,
	task: string,
	skills: string[],
	signal?: AbortSignal,
	onUpdate?: OnUpdate,
): Promise<string> {
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	for (const skill of skills) args.push("--skill", skill);

	let tmpDir: string | null = null;

	try {
		onUpdate?.({ content: [{ type: "text", text: "Subagent running..." }] });

		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
		const promptFile = path.join(tmpDir, "prompt.md");
		await fs.promises.writeFile(promptFile, MINIMAL_SYSTEM_PROMPT, {
			encoding: "utf-8",
			mode: 0o600,
		});
		args.push("--append-system-prompt", promptFile);

		if (task.length > MAX_TASK_ARG_LENGTH) {
			const taskFile = path.join(tmpDir, "task.md");
			await fs.promises.writeFile(taskFile, task, {
				encoding: "utf-8",
				mode: 0o600,
			});
			args.push(
				`Task: Please read ${taskFile} and follow the instructions there.`,
			);
		} else {
			args.push(`Task: ${task}`);
		}

		const invocation = getPiInvocation(args);
		const proc = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, [NESTING_GUARD]: "true" },
		});

		const run: ChildRun = {
			turns: [],
			stderr: "",
			exitCode: 0,
			killedBy: null,
			aborted: false,
		};
		const flush = consumeChildStream(proc, run, onUpdate);
		const exit = await awaitChildExit(proc, signal, flush);

		run.exitCode = exit.code;
		run.killedBy = exit.killedBy;
		run.aborted = signal?.aborted ?? false;
		run.stderr = run.stderr.trim();

		const outcome = decideOutcome(run);
		if (outcome.kind === "failure") {
			// pi only marks a tool result as an error when execute() throws;
			// returning { isError: true } is ignored by the agent loop.
			throw new Error(outcome.message);
		}
		return outcome.text;
	} finally {
		if (tmpDir) {
			try {
				await fs.promises.rm(tmpDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	}
}

const SubagentParams = Type.Object({
	task: Type.String({ description: "Task to delegate to the subagent" }),
	skills: Type.Optional(
		Type.Array(
			Type.String({ description: "Skill path or name to load via --skill" }),
			{
				description: "Optional startup skills to load into the subagent process",
			},
		),
	),
});

export default function (pi: ExtensionAPI) {
	if (process.env[NESTING_GUARD] === "true") return;

	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description:
			"Delegate tasks to fresh pi subagents with isolated context windows. You may invoke multiple subagents in parallel via separate tool calls. Each subagent returns a concise summary or report when its work is done. Optional startup skills can be preloaded.",
		promptSnippet: "Delegate a task to an isolated subagent process",
		promptGuidelines: [
			"Delegate non-trivial, self-contained tasks to subagents so you can stay focused on the overall picture.",
		],
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			return {
				content: [
					{
						type: "text",
						text: await runSubagent(
							ctx.cwd,
							params.task,
							params.skills ?? [],
							signal,
							onUpdate,
						),
					},
				],
			};
		},

		renderCall(args, theme) {
			const taskPreview =
				args.task.length > 60 ? `${args.task.slice(0, 60)}...` : args.task;
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("dim", taskPreview);
			const skills = args.skills ?? [];
			if (skills.length > 0)
				text += ` ${theme.fg("accent", `+${skills.length} skills`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, options, theme) {
			const output = result.content.find((c) => c.type === "text")?.text ?? "";
			if (options.isPartial) {
				return new Text(theme.fg("muted", output || "Subagent running..."), 0, 0);
			}
			if (result.isError) {
				return new Text(`${theme.fg("error", "✗ Failed")}\n${output}`, 0, 0);
			}
			return new Text(
				`${theme.fg("success", "✓ ")}${theme.fg("muted", "--- Result ---")}\n${output}`,
				0,
				0,
			);
		},
	});
}
