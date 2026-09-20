/**
 * Multi-model Web Quota Tracker & Plan Gate
 * Supports Sol (3h rolling window) and Astra (7d weekly window for Pro+ accounts)
 */

export const PLAN_TIER = {
  free: 0,
  plus: 1,
  pro: 2,
  team: 2,
  enterprise: 3,
} as const;

export type PlanType = keyof typeof PLAN_TIER;

export interface WebModelQuotaConfig {
  modelId: string;
  minPlan: PlanType;
  windowDurationMs: number;
  defaultLimit: number;
  reasoningEffort: string;
}

export const WEB_MODELS_CONFIG: Record<string, WebModelQuotaConfig> = {
  "WEB-gpt-5.6-sol": {
    modelId: "WEB-gpt-5.6-sol",
    minPlan: "plus",
    windowDurationMs: 3 * 60 * 60 * 1000, // 3 hours
    defaultLimit: 40,
    reasoningEffort: "high",
  },
  "WEB-gpt-6-astra": {
    modelId: "WEB-gpt-6-astra",
    minPlan: "pro",
    windowDurationMs: 7 * 24 * 60 * 60 * 1000, // 7 days (weekly)
    defaultLimit: 200,
    reasoningEffort: "high",
  },
};

export interface WebQuotaWindowState {
  totalUsed: number;
  measuredLimit: number;
  cycleStartedAt: number;
  lastUsedAt: number | null;
  history: Array<{ timestamp: number }>;
}

export interface MultiModelQuotaState {
  activePlan: PlanType;
  models: Record<string, WebQuotaWindowState>;
}

export class MultiModelQuotaService {
  private state: MultiModelQuotaState;

  constructor(initialPlan: PlanType = "plus") {
    this.state = {
      activePlan: initialPlan,
      models: {
        "WEB-gpt-5.6-sol": {
          totalUsed: 0,
          measuredLimit: WEB_MODELS_CONFIG["WEB-gpt-5.6-sol"].defaultLimit,
          cycleStartedAt: Date.now(),
          lastUsedAt: null,
          history: [],
        },
        "WEB-gpt-6-astra": {
          totalUsed: 0,
          measuredLimit: WEB_MODELS_CONFIG["WEB-gpt-6-astra"].defaultLimit,
          cycleStartedAt: Date.now(),
          lastUsedAt: null,
          history: [],
        },
      },
    };
  }

  setPlan(plan: PlanType): void {
    this.state.activePlan = plan;
  }

  getPlan(): PlanType {
    return this.state.activePlan;
  }

  isModelAllowed(modelId: string): boolean {
    const cfg = WEB_MODELS_CONFIG[modelId];
    if (!cfg) return false;
    return PLAN_TIER[this.state.activePlan] >= PLAN_TIER[cfg.minPlan];
  }

  recordUsage(modelId: string, now: number = Date.now()): boolean {
    if (!this.isModelAllowed(modelId)) {
      return false;
    }

    const cfg = WEB_MODELS_CONFIG[modelId];
    const modelState = this.state.models[modelId];
    if (!modelState) return false;

    // Check window expiration
    if (now - modelState.cycleStartedAt >= cfg.windowDurationMs) {
      modelState.cycleStartedAt = now;
      modelState.totalUsed = 0;
      modelState.history = [];
    }

    modelState.totalUsed += 1;
    modelState.lastUsedAt = now;
    modelState.history.push({ timestamp: now });
    if (modelState.history.length > 500) {
      modelState.history = modelState.history.slice(-500);
    }
    return true;
  }

  getSummary(modelId: string, now: number = Date.now()) {
    const cfg = WEB_MODELS_CONFIG[modelId];
    if (!cfg) return null;

    const allowed = this.isModelAllowed(modelId);
    const modelState = this.state.models[modelId] || {
      totalUsed: 0,
      measuredLimit: cfg.defaultLimit,
      cycleStartedAt: now,
      lastUsedAt: null,
      history: [],
    };

    const elapsed = now - modelState.cycleStartedAt;
    const remainingMs = Math.max(0, cfg.windowDurationMs - elapsed);

    return {
      model: cfg.modelId,
      allowed,
      minPlan: cfg.minPlan,
      activePlan: this.state.activePlan,
      reasoningEffort: cfg.reasoningEffort,
      totalUsed: modelState.totalUsed,
      measuredLimit: modelState.measuredLimit,
      windowDurationMs: cfg.windowDurationMs,
      remainingSeconds: Math.floor(remainingMs / 1000),
      cycleStartedAt: modelState.cycleStartedAt,
      lastUsedAt: modelState.lastUsedAt,
    };
  }
}
