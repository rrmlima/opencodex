import type { WebQuotaSnapshot } from "./contracts";

export interface QuotaEvaluationResult {
  eligible: boolean;
  reason:
    | "ELIGIBLE"
    | "EXHAUSTED"
    | "UNKNOWN"
    | "STALE"
    | "CONFIDENCE_TOO_LOW";
  remainingEstimated?: number;
  resetInSeconds?: number;
}

export class QuotaTrackerService {
  private snapshots = new Map<string, WebQuotaSnapshot>();

  recordSnapshot(snapshot: WebQuotaSnapshot): void {
    this.snapshots.set(snapshot.accountScopeHash, snapshot);
  }

  getLatestSnapshot(accountScopeHash: string): WebQuotaSnapshot | null {
    return this.snapshots.get(accountScopeHash) || null;
  }

  evaluateEligibility(accountScopeHash: string, now: number = Date.now()): QuotaEvaluationResult {
    const snap = this.getLatestSnapshot(accountScopeHash);
    if (!snap) {
      return { eligible: false, reason: "UNKNOWN" };
    }

    const staleAt = new Date(snap.staleAfter).getTime();
    if (now >= staleAt) {
      return { eligible: false, reason: "STALE" };
    }

    if (snap.confidence < 0.5) {
      return { eligible: false, reason: "CONFIDENCE_TOO_LOW" };
    }

    const primaryWindow = snap.windows.find((w) => w.kind === "HOURLY" || w.kind === "SESSION") || snap.windows[0];
    if (!primaryWindow) {
      return { eligible: false, reason: "UNKNOWN" };
    }

    if (typeof primaryWindow.remaining === "number" && primaryWindow.remaining <= 0) {
      const resetTime = primaryWindow.resetAt ? new Date(primaryWindow.resetAt).getTime() : now + 3600_000;
      const secRemaining = Math.max(0, Math.floor((resetTime - now) / 1000));
      return {
        eligible: false,
        reason: "EXHAUSTED",
        remainingEstimated: 0,
        resetInSeconds: secRemaining,
      };
    }

    return {
      eligible: true,
      reason: "ELIGIBLE",
      remainingEstimated: primaryWindow.remaining,
    };
  }
}
