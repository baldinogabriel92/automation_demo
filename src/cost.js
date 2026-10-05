import { modelOrThrow, BASELINE_MODEL } from './models.js';

/** USD for one call. */
export function costOf(modelId, usage) {
  const m = modelOrThrow(modelId);
  return (
    (usage.inputTokens / 1_000_000) * m.inputPerMTok +
    (usage.outputTokens / 1_000_000) * m.outputPerMTok
  );
}

/** Rough token estimate, used only in mock mode. Live mode reads real usage. */
export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

/**
 * Running spend ledger. Tracks what we actually spent and what the same work
 * would have cost on the all-frontier baseline, so the savings number is a
 * measured comparison rather than a claim.
 */
export class Ledger {
  constructor(baselineModel = BASELINE_MODEL) {
    this.baselineModel = baselineModel;
    this.calls = [];
  }

  record({ stage, model, usage }) {
    this.calls.push({
      stage,
      model,
      usage,
      cost: costOf(model, usage),
      baselineCost: costOf(this.baselineModel, usage),
    });
  }

  totals() {
    const spend = this.calls.reduce((a, c) => a + c.cost, 0);
    const baseline = this.calls.reduce((a, c) => a + c.baselineCost, 0);
    const byModel = {};
    for (const c of this.calls) {
      byModel[c.model] ??= { calls: 0, cost: 0 };
      byModel[c.model].calls += 1;
      byModel[c.model].cost += c.cost;
    }
    return {
      spend,
      baseline,
      saved: baseline - spend,
      savedPct: baseline === 0 ? 0 : ((baseline - spend) / baseline) * 100,
      byModel,
    };
  }
}

export const usd = (n) => `$${n.toFixed(4)}`;
