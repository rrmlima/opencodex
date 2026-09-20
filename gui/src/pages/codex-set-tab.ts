import type { KeyboardEvent } from "react";

export type CodexSetTab = "multiauth" | "prompt" | "webquota";

export function readCodexSetTabFromHash(): CodexSetTab {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "codex-set/prompt") return "prompt";
  if (hash === "codex-set/web-quota") return "webquota";
  return "multiauth";
}

export function selectCodexSetTab(next: CodexSetTab): void {
  if (next === "prompt") {
    window.location.hash = "codex-set/prompt";
  } else if (next === "webquota") {
    window.location.hash = "codex-set/web-quota";
  } else {
    window.location.hash = "codex-set";
  }
}

export function codexSetTabKeyDown(e: KeyboardEvent): void {
  if (e.key === "ArrowLeft" || e.key === "Home") {
    e.preventDefault();
    selectCodexSetTab("multiauth");
    document.getElementById("codex-set-tab-multiauth")?.focus();
  } else if (e.key === "ArrowRight" || e.key === "End") {
    e.preventDefault();
    selectCodexSetTab("webquota");
    document.getElementById("codex-set-tab-webquota")?.focus();
  }
}
