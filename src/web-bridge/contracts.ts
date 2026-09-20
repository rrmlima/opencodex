/**
 * Type contracts and interfaces for Web Bridge subsystem.
 * Follows the Astra/Sol architectural guidelines:
 * - Decoupled driver boundary (no DOM selectors or Puppeteer imports in core).
 * - Finite state machine with unambiguous dispatch states.
 * - Strict serialized lease coordination.
 */

export type InvocationState =
  | "PENDING"
  | "ACQUIRING_LEASE"
  | "ACCOUNT_VERIFIED"
  | "PREPARING"
  | "DISPATCH_INTENT"
  | "SENT_CONFIRMED"
  | "STREAMING"
  | "SETTLED"
  | "FAILED_SAFE"
  | "FAILED_AMBIGUOUS"
  | "CANCELLED";

export type BreakerCause =
  | "AUTH"
  | "ACCOUNT_MISMATCH"
  | "DOM_CONTRACT"
  | "TRANSPORT"
  | "QUOTA"
  | "PROVIDER_TRANSIENT"
  | "COORDINATION";

export interface DriverHandshakeRequest {
  clientVersion: string;
  supportedCapabilities: string[];
  leaseOwnerId: string;
}

export interface DriverHandshakeResponse {
  driverVersion: string;
  protocolVersion: string;
  capabilities: string[];
  browserMode: "local-managed" | "local-cdp" | "remote-tunnel";
  activeAccountHash: string;
}

export interface PreparedContent {
  content: string;
  fencingToken: string;
  accountScopeHash: string;
}

export interface InvocationEnvelope {
  requestId: string;
  clientRequestId: string;
  model: string;
  prompt: string;
  accountScopeHash: string;
  fencingToken: string;
  createdAt: number;
}

export interface InvocationJournalRecord {
  requestId: string;
  clientRequestId: string;
  state: InvocationState;
  model: string;
  accountScopeHash: string;
  fencingToken: string;
  errorMessage?: string;
  breakerCause?: BreakerCause;
  createdAt: number;
  updatedAt: number;
}

export interface IInvocationJournal {
  create(record: Omit<InvocationJournalRecord, "updatedAt">): Promise<InvocationJournalRecord>;
  transition(
    requestId: string,
    from: InvocationState | InvocationState[],
    to: InvocationState,
    meta?: { errorMessage?: string; breakerCause?: BreakerCause }
  ): Promise<boolean>;
  get(requestId: string): Promise<InvocationJournalRecord | null>;
  getByClientRequestId(clientRequestId: string): Promise<InvocationJournalRecord | null>;
}

export interface IAccountCoordinator {
  acquireLease(accountScopeHash: string, leaseOwnerId: string, ttlMs: number): Promise<{ acquired: boolean; fencingToken?: string }>;
  renewLease(accountScopeHash: string, fencingToken: string, ttlMs: number): Promise<boolean>;
  releaseLease(accountScopeHash: string, fencingToken: string): Promise<boolean>;
}

export interface IWebBridgeDriver {
  handshake(request: DriverHandshakeRequest, signal?: AbortSignal): Promise<DriverHandshakeResponse>;
  verifyAccount(accountScopeHash: string, signal?: AbortSignal): Promise<boolean>;
  prepareInvocation(envelope: InvocationEnvelope, signal?: AbortSignal): Promise<PreparedContent>;
  dispatch(prepared: PreparedContent, signal?: AbortSignal): Promise<{ confirmedSent: boolean; ambiguous: boolean }>;
  streamResponse(
    fencingToken: string,
    onChunk: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; finishReason: "stop" | "length" | "error" }>;
}

export interface WebQuotaWindow {
  kind: "SESSION" | "HOURLY" | "DAILY" | "WEEKLY" | "UNKNOWN";
  unit: "REQUESTS" | "TOKENS" | "PERCENT" | "UNKNOWN";
  used?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string;
  resetSource?: "DIRECT" | "INFERRED";
  confidence: number;
}

export interface WebQuotaSnapshot {
  snapshotId: string;
  provider: string;
  accountScopeHash: string;
  source: "DIRECT_UI" | "DRIVER_SIGNAL" | "INFERRED";
  observedAt: string;
  staleAfter: string;
  windows: WebQuotaWindow[];
  driverVersion: string;
  contractVersion: string;
  confidence: number;
  createdAt: string;
}
