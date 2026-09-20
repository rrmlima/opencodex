import { describe, expect, it } from "bun:test";
import { WebBridgeEngine, CircuitBreakerRegistry } from "../../src/web-bridge/WebBridgeEngine";
import { InMemoryInvocationJournal, InMemoryAccountCoordinator } from "../../src/web-bridge/memory-stores";
import type { IWebBridgeDriver, PreparedContent, InvocationEnvelope } from "../../src/web-bridge/contracts";
import { AmbiguousDispatchError, CircuitBreakerOpenError } from "../../src/web-bridge/errors";

class MockWebBridgeDriver implements IWebBridgeDriver {
  public failDispatchAmbiguous = false;
  public accountMismatch = false;

  async handshake() {
    return {
      driverVersion: "1.0.0",
      protocolVersion: "1.0",
      capabilities: ["chat", "stream"],
      browserMode: "local-managed" as const,
      activeAccountHash: "acc_hash_123",
    };
  }

  async verifyAccount(accountScopeHash: string) {
    if (this.accountMismatch) return false;
    return accountScopeHash === "acc_hash_123";
  }

  async prepareInvocation(envelope: InvocationEnvelope): Promise<PreparedContent> {
    return {
      content: envelope.prompt,
      fencingToken: envelope.fencingToken,
      accountScopeHash: envelope.accountScopeHash,
    };
  }

  async dispatch(prepared: PreparedContent) {
    if (this.failDispatchAmbiguous) {
      return { confirmedSent: false, ambiguous: true };
    }
    return { confirmedSent: true, ambiguous: false };
  }

  async streamResponse(fencingToken: string, onChunk: (delta: string) => void) {
    onChunk("Hello ");
    onChunk("from mock!");
    return { text: "Hello from mock!", finishReason: "stop" as const };
  }
}

describe("WebBridgeEngine & Journal", () => {
  it("executes complete lifecycle from PENDING to SETTLED without duplicates", async () => {
    const journal = new InMemoryInvocationJournal();
    const coordinator = new InMemoryAccountCoordinator();
    const driver = new MockWebBridgeDriver();
    const engine = new WebBridgeEngine(journal, coordinator, driver);

    const chunks: string[] = [];
    const envelope: InvocationEnvelope = {
      requestId: "req_1",
      clientRequestId: "client_1",
      model: "WEB-gpt-5.6-sol",
      prompt: "Hello",
      accountScopeHash: "acc_hash_123",
      fencingToken: "fence_1",
      createdAt: Date.now(),
    };

    const res = await engine.executeInvocation(envelope, (c) => chunks.push(c));
    expect(res.text).toBe("Hello from mock!");
    expect(chunks).toEqual(["Hello ", "from mock!"]);
    expect(res.record.state).toBe("SETTLED");
  });

  it("prohibits automatic retry when dispatch returns ambiguous (Astra directive)", async () => {
    const journal = new InMemoryInvocationJournal();
    const coordinator = new InMemoryAccountCoordinator();
    const driver = new MockWebBridgeDriver();
    driver.failDispatchAmbiguous = true;
    const engine = new WebBridgeEngine(journal, coordinator, driver);

    const envelope: InvocationEnvelope = {
      requestId: "req_ambiguous",
      clientRequestId: "client_ambiguous",
      model: "WEB-gpt-5.6-sol",
      prompt: "Mutating command",
      accountScopeHash: "acc_hash_123",
      fencingToken: "fence_2",
      createdAt: Date.now(),
    };

    await expect(engine.executeInvocation(envelope)).rejects.toThrow(AmbiguousDispatchError);

    const record = await journal.get("req_ambiguous");
    expect(record?.state).toBe("FAILED_AMBIGUOUS");
  });

  it("trips circuit breaker on account mismatch", async () => {
    const journal = new InMemoryInvocationJournal();
    const coordinator = new InMemoryAccountCoordinator();
    const driver = new MockWebBridgeDriver();
    driver.accountMismatch = true;
    const breakers = new CircuitBreakerRegistry();
    const engine = new WebBridgeEngine(journal, coordinator, driver, breakers);

    const envelope: InvocationEnvelope = {
      requestId: "req_mismatch",
      clientRequestId: "client_mismatch",
      model: "WEB-gpt-5.6-sol",
      prompt: "Hello",
      accountScopeHash: "acc_hash_123",
      fencingToken: "fence_3",
      createdAt: Date.now(),
    };

    await expect(engine.executeInvocation(envelope)).rejects.toThrow();
    expect(breakers.isOpen("ACCOUNT_MISMATCH")).toBe(true);

    // Second call should immediately fail via breaker
    await expect(engine.executeInvocation(envelope)).rejects.toThrow(CircuitBreakerOpenError);
  });
});
