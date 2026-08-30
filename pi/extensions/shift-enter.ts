import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

const NEWLINE_INPUT = "\n";
const KITTY_SHIFT_ENTER_FALLBACK = "\x1b\r";
const TMUX_SHIFT_ENTER_FALLBACK = "\x1b[13;3u";

export function normalizeShiftEnter(data: string): string {
  return data === KITTY_SHIFT_ENTER_FALLBACK ||
    data === TMUX_SHIFT_ENTER_FALLBACK ||
    matchesKey(data, "shift+enter")
    ? NEWLINE_INPUT
    : data;
}

export default function shiftEnterExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.onTerminalInput((data) => {
      const normalized = normalizeShiftEnter(data);
      return normalized === data ? undefined : { data: normalized };
    });
  });
}
