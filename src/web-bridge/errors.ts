import type { BreakerCause } from "./contracts";

export class WebBridgeError extends Error {
  constructor(message: string, public readonly code: string, public readonly isSafeFailure: boolean = true) {
    super(message);
    this.name = "WebBridgeError";
  }
}

export class AmbiguousDispatchError extends WebBridgeError {
  constructor(message: string, public readonly fencingToken: string) {
    super(message, "AMBIGUOUS_DISPATCH", false);
    this.name = "AmbiguousDispatchError";
  }
}

export class CircuitBreakerOpenError extends WebBridgeError {
  constructor(public readonly cause: BreakerCause, public readonly retryAfterMs?: number) {
    super(`Circuit breaker is open due to ${cause}.`, `CIRCUIT_BREAKER_${cause}`);
    this.name = "CircuitBreakerOpenError";
  }
}

export class LeaseConflictError extends WebBridgeError {
  constructor(public readonly accountScopeHash: string) {
    super(`Account ${accountScopeHash} has an active exclusive lease.`, "LEASE_CONFLICT");
    this.name = "LeaseConflictError";
  }
}

export class AccountMismatchError extends WebBridgeError {
  constructor(expected: string, actual: string) {
    super(`Account mismatch: expected ${expected}, got ${actual}.`, "ACCOUNT_MISMATCH");
    this.name = "AccountMismatchError";
  }
}
