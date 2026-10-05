// Model registry. Prices are USD per million tokens, Anthropic first-party API.
// Verify against platform.claude.com/docs/en/pricing before using these numbers
// for real budgeting — rates change and partner platforms bill separately.
export const MODELS = {
  'claude-haiku-4-5': {
    provider: 'anthropic',
    tier: 'fast',
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    supportsEffort: false, // effort errors on Haiku 4.5
    contextTokens: 200_000,
  },
  'claude-sonnet-5': {
    provider: 'anthropic',
    tier: 'balanced',
    inputPerMTok: 3.0, // introductory $2.00 through 2026-08-31
    outputPerMTok: 15.0, // introductory $10.00 through 2026-08-31
    supportsEffort: true,
    contextTokens: 1_000_000,
  },
  'claude-opus-5': {
    provider: 'anthropic',
    tier: 'frontier',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    supportsEffort: true,
    contextTokens: 1_000_000,
  },
};

// The model every classification runs on. Classification is a short, highly
// constrained task — paying frontier rates for it is the single most common
// source of waste in a triage pipeline.
export const CLASSIFIER_MODEL = 'claude-haiku-4-5';

// What the cost comparison in the ledger is measured against: the naive
// "send everything to the best model" setup most teams start with.
export const BASELINE_MODEL = 'claude-opus-5';

export function modelOrThrow(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}
