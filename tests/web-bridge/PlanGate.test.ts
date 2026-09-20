import { describe, expect, it } from "bun:test";
import { MultiModelQuotaService } from "../../src/web-bridge/plan-gate";

describe("Plan Gate & Multi-Model Quota Tracker (SDD Verification)", () => {
  it("enforces fail-closed: Plus account cannot access Astra", () => {
    const service = new MultiModelQuotaService("plus");

    expect(service.isModelAllowed("WEB-gpt-5.6-sol")).toBe(true);
    expect(service.isModelAllowed("WEB-gpt-6-astra")).toBe(false);

    // Recording usage on Astra fails for Plus
    const recorded = service.recordUsage("WEB-gpt-6-astra");
    expect(recorded).toBe(false);
  });

  it("permits Pro account to access both Sol and Astra", () => {
    const service = new MultiModelQuotaService("pro");

    expect(service.isModelAllowed("WEB-gpt-5.6-sol")).toBe(true);
    expect(service.isModelAllowed("WEB-gpt-6-astra")).toBe(true);

    const recorded = service.recordUsage("WEB-gpt-6-astra");
    expect(recorded).toBe(true);

    const summary = service.getSummary("WEB-gpt-6-astra");
    expect(summary?.allowed).toBe(true);
    expect(summary?.totalUsed).toBe(1);
    expect(summary?.measuredLimit).toBe(200); // Astra default limit
  });

  it("isolates quotas: usage on Sol does not affect Astra", () => {
    const service = new MultiModelQuotaService("pro");

    service.recordUsage("WEB-gpt-5.6-sol");
    service.recordUsage("WEB-gpt-5.6-sol");

    const solSummary = service.getSummary("WEB-gpt-5.6-sol");
    const astraSummary = service.getSummary("WEB-gpt-6-astra");

    expect(solSummary?.totalUsed).toBe(2);
    expect(astraSummary?.totalUsed).toBe(0);
  });

  it("respects different window durations (Sol=3h, Astra=7d)", () => {
    const service = new MultiModelQuotaService("pro");
    const solSummary = service.getSummary("WEB-gpt-5.6-sol");
    const astraSummary = service.getSummary("WEB-gpt-6-astra");

    expect(solSummary?.windowDurationMs).toBe(3 * 60 * 60 * 1000);
    expect(astraSummary?.windowDurationMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
