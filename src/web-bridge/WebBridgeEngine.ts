import type {
  IAccountCoordinator,
  IInvocationJournal,
  IWebBridgeDriver,
  InvocationEnvelope,
  InvocationJournalRecord,
  BreakerCause,
} from "./contracts";
import { AmbiguousDispatchError, CircuitBreakerOpenError, LeaseConflictError } from "./errors";

export interface CircuitBreakerState {
  isOpen: boolean;
  cause?: BreakerCause;
  openedAt?: number;
  cooloffMs: number;
}

export class CircuitBreakerRegistry {
  private breakers = new Map<BreakerCause, CircuitBreakerState>();

  constructor() {
    const causes: BreakerCause[] = [
      "AUTH",
      "ACCOUNT_MISMATCH",
      "DOM_CONTRACT",
      "TRANSPORT",
      "QUOTA",
      "PROVIDER_TRANSIENT",
      "COORDINATION",
    ];
    for (const c of causes) {
      this.breakers.set(c, { isOpen: false, cooloffMs: 30_000 });
    }
  }

  isOpen(cause: BreakerCause): boolean {
    const b = this.breakers.get(cause);
    if (!b || !b.isOpen) return false;
    const now = Date.now();
    if (b.openedAt && now - b.openedAt >= b.cooloffMs) {
      // Half-open eligible
      return false;
    }
    return true;
  }

  trip(cause: BreakerCause, cooloffMs: number = 30_000): void {
    this.breakers.set(cause, { isOpen: true, cause, openedAt: Date.now(), cooloffMs });
  }

  reset(cause: BreakerCause): void {
    const b = this.breakers.get(cause);
    if (b) {
      b.isOpen = false;
      b.openedAt = undefined;
    }
  }

  isAnyOpen(): { open: boolean; cause?: BreakerCause } {
    for (const [cause, state] of this.breakers.entries()) {
      if (this.isOpen(cause)) {
        return { open: true, cause };
      }
    }
    return { open: false };
  }
}

export class WebBridgeEngine {
  constructor(
    private readonly journal: IInvocationJournal,
    private readonly coordinator: IAccountCoordinator,
    private readonly driver: IWebBridgeDriver,
    private readonly breakers: CircuitBreakerRegistry = new CircuitBreakerRegistry()
  ) {}

  async executeInvocation(
    envelope: InvocationEnvelope,
    onChunk?: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; record: InvocationJournalRecord }> {
    // 1. Check circuit breakers
    const breakerCheck = this.breakers.isAnyOpen();
    if (breakerCheck.open && breakerCheck.cause) {
      throw new CircuitBreakerOpenError(breakerCheck.cause);
    }

    // 2. Initialize Journal record in PENDING
    const record = await this.journal.create({
      requestId: envelope.requestId,
      clientRequestId: envelope.clientRequestId,
      state: "PENDING",
      model: envelope.model,
      accountScopeHash: envelope.accountScopeHash,
      fencingToken: envelope.fencingToken,
      createdAt: envelope.createdAt,
    });

    // 3. Acquire exclusive lease for account scope
    await this.journal.transition(envelope.requestId, "PENDING", "ACQUIRING_LEASE");
    const lease = await this.coordinator.acquireLease(envelope.accountScopeHash, envelope.requestId, 60_000);
    if (!lease.acquired) {
      await this.journal.transition(envelope.requestId, "ACQUIRING_LEASE", "FAILED_SAFE", {
        errorMessage: "Exclusive lease conflict on account scope",
        breakerCause: "COORDINATION",
      });
      throw new LeaseConflictError(envelope.accountScopeHash);
    }

    try {
      // 4. Verify Account identity
      const accountOk = await this.driver.verifyAccount(envelope.accountScopeHash, signal);
      if (!accountOk) {
        this.breakers.trip("ACCOUNT_MISMATCH");
        await this.journal.transition(envelope.requestId, "ACQUIRING_LEASE", "FAILED_SAFE", {
          errorMessage: "Account mismatch detected on driver",
          breakerCause: "ACCOUNT_MISMATCH",
        });
        throw new Error("Account mismatch on driver");
      }
      await this.journal.transition(envelope.requestId, "ACQUIRING_LEASE", "ACCOUNT_VERIFIED");

      // 5. Prepare Invocation
      await this.journal.transition(envelope.requestId, "ACCOUNT_VERIFIED", "PREPARING");
      const prepared = await this.driver.prepareInvocation(envelope, signal);

      // 6. DISPATCH_INTENT: Point of no return. Beyond this point, retry/failover is prohibited.
      await this.journal.transition(envelope.requestId, "PREPARING", "DISPATCH_INTENT");

      const dispatchResult = await this.driver.dispatch(prepared, signal);
      if (dispatchResult.ambiguous || !dispatchResult.confirmedSent) {
        // Must transition to FAILED_AMBIGUOUS. Do NOT retry automatically.
        await this.journal.transition(envelope.requestId, "DISPATCH_INTENT", "FAILED_AMBIGUOUS", {
          errorMessage: "Dispatch completed with ambiguous delivery confirmation",
          breakerCause: "TRANSPORT",
        });
        throw new AmbiguousDispatchError(
          "Prompt dispatched but delivery confirmation is ambiguous. Aborting to prevent duplication.",
          envelope.fencingToken
        );
      }

      await this.journal.transition(envelope.requestId, "DISPATCH_INTENT", "SENT_CONFIRMED");

      // 7. Stream Response
      await this.journal.transition(envelope.requestId, "SENT_CONFIRMED", "STREAMING");
      const result = await this.driver.streamResponse(envelope.fencingToken, onChunk ?? (() => {}), signal);

      // 8. SETTLED
      await this.journal.transition(envelope.requestId, "STREAMING", "SETTLED");
      const updated = (await this.journal.get(envelope.requestId)) || record;

      return { text: result.text, record: updated };
    } catch (err: any) {
      if (err instanceof AmbiguousDispatchError) {
        throw err;
      }
      await this.journal.transition(
        envelope.requestId,
        ["PENDING", "ACQUIRING_LEASE", "ACCOUNT_VERIFIED", "PREPARING", "STREAMING"],
        "FAILED_SAFE",
        { errorMessage: err?.message || String(err) }
      );
      throw err;
    } finally {
      await this.coordinator.releaseLease(envelope.accountScopeHash, envelope.fencingToken);
    }
  }
}
