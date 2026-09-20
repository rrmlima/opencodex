import type { IAccountCoordinator, IInvocationJournal, InvocationJournalRecord, InvocationState, BreakerCause } from "./contracts";

export class InMemoryInvocationJournal implements IInvocationJournal {
  private records = new Map<string, InvocationJournalRecord>();
  private clientIndex = new Map<string, string>();

  async create(record: Omit<InvocationJournalRecord, "updatedAt">): Promise<InvocationJournalRecord> {
    const full: InvocationJournalRecord = {
      ...record,
      updatedAt: record.createdAt,
    };
    this.records.set(full.requestId, full);
    this.clientIndex.set(full.clientRequestId, full.requestId);
    return full;
  }

  async transition(
    requestId: string,
    from: InvocationState | InvocationState[],
    to: InvocationState,
    meta?: { errorMessage?: string; breakerCause?: BreakerCause }
  ): Promise<boolean> {
    const rec = this.records.get(requestId);
    if (!rec) return false;

    const allowed = Array.isArray(from) ? from.includes(rec.state) : rec.state === from;
    if (!allowed) {
      return false;
    }

    rec.state = to;
    rec.updatedAt = Date.now();
    if (meta?.errorMessage) rec.errorMessage = meta.errorMessage;
    if (meta?.breakerCause) rec.breakerCause = meta.breakerCause;
    return true;
  }

  async get(requestId: string): Promise<InvocationJournalRecord | null> {
    return this.records.get(requestId) || null;
  }

  async getByClientRequestId(clientRequestId: string): Promise<InvocationJournalRecord | null> {
    const reqId = this.clientIndex.get(clientRequestId);
    if (!reqId) return null;
    return this.get(reqId);
  }
}

export class InMemoryAccountCoordinator implements IAccountCoordinator {
  private activeLeases = new Map<string, { ownerId: string; expiresAt: number; fencingToken: string }>();
  private tokenSeq = 0;

  async acquireLease(
    accountScopeHash: string,
    leaseOwnerId: string,
    ttlMs: number
  ): Promise<{ acquired: boolean; fencingToken?: string }> {
    const now = Date.now();
    const current = this.activeLeases.get(accountScopeHash);

    if (current && current.expiresAt > now && current.ownerId !== leaseOwnerId) {
      return { acquired: false };
    }

    this.tokenSeq += 1;
    const fencingToken = `fence_${this.tokenSeq}_${now}`;
    this.activeLeases.set(accountScopeHash, {
      ownerId: leaseOwnerId,
      expiresAt: now + ttlMs,
      fencingToken,
    });
    return { acquired: true, fencingToken };
  }

  async renewLease(accountScopeHash: string, fencingToken: string, ttlMs: number): Promise<boolean> {
    const current = this.activeLeases.get(accountScopeHash);
    if (!current || current.fencingToken !== fencingToken) return false;
    current.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async releaseLease(accountScopeHash: string, fencingToken: string): Promise<boolean> {
    const current = this.activeLeases.get(accountScopeHash);
    if (!current || current.fencingToken !== fencingToken) return false;
    this.activeLeases.delete(accountScopeHash);
    return true;
  }
}
