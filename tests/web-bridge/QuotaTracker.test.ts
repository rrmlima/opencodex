import { describe, expect, it } from "bun:test";
import { QuotaTrackerService } from "../../src/web-bridge/quota-tracker";
import type { WebQuotaSnapshot } from "../../src/web-bridge/contracts";

describe("QuotaTrackerService", () => {
  it("marks missing snapshot as UNKNOWN rather than assuming infinite quota", () => {
    const tracker = new QuotaTrackerService();
    const result = tracker.evaluateEligibility("acc_missing");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("UNKNOWN");
  });

  it("marks expired snapshot as STALE", () => {
    const tracker = new QuotaTrackerService();
    const now = Date.now();
    const snapshot: WebQuotaSnapshot = {
      snapshotId: "snap_1",
      provider: "openai-web",
      accountScopeHash: "acc_1",
      source: "DIRECT_UI",
      observedAt: new Date(now - 60_000).toISOString(),
      staleAfter: new Date(now - 1_000).toISOString(),
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      driverVersion: "1.0.0",
      contractVersion: "1.0",
      windows: [{ kind: "HOURLY", unit: "REQUESTS", remaining: 20, confidence: 0.9 }],
    };

    tracker.recordSnapshot(snapshot);
    const result = tracker.evaluateEligibility("acc_1", now);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("STALE");
  });

  it("reports EXHAUSTED when remaining quota reaches zero", () => {
    const tracker = new QuotaTrackerService();
    const now = Date.now();
    const snapshot: WebQuotaSnapshot = {
      snapshotId: "snap_2",
      provider: "openai-web",
      accountScopeHash: "acc_2",
      source: "DIRECT_UI",
      observedAt: new Date(now).toISOString(),
      staleAfter: new Date(now + 600_000).toISOString(),
      confidence: 0.9,
      createdAt: new Date().toISOString(),
      driverVersion: "1.0.0",
      contractVersion: "1.0",
      windows: [
        {
          kind: "HOURLY",
          unit: "REQUESTS",
          remaining: 0,
          limit: 40,
          resetAt: new Date(now + 3600_000).toISOString(),
          confidence: 0.9,
        },
      ],
    };

    tracker.recordSnapshot(snapshot);
    const result = tracker.evaluateEligibility("acc_2", now);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("EXHAUSTED");
    expect(result.resetInSeconds).toBeGreaterThan(0);
  });
});
