// Routing policy. This is the file a non-engineer operator should be able to
// read: every rule that decides cost, autonomy, and escalation lives here.

export const INTENTS = [
  'order_status',
  'shipping_change',
  'refund',
  'subscription_cancel',
  'subscription_pause',
  'product_question',
  'billing_dispute',
  'account_access',
  'clinical_question',
  'side_effect_report',
];

export const DEFAULT_POLICY = {
  // Which model drafts the reply, by how hard the ticket is.
  modelByComplexity: {
    low: 'claude-haiku-4-5',
    medium: 'claude-sonnet-5',
    high: 'claude-opus-5',
  },

  // Thinking effort per tier. Haiku 4.5 does not accept the effort parameter.
  effortByModel: {
    'claude-haiku-4-5': null,
    'claude-sonnet-5': 'medium',
    'claude-opus-5': 'high',
  },

  // Below this classifier confidence, a human always sees the ticket first.
  autoResolveMinConfidence: 0.75,

  // Intents that may never be closed without a human, regardless of how
  // confident the classifier is. Money and medicine both live here.
  neverAutoResolve: ['billing_dispute', 'refund', 'clinical_question', 'side_effect_report'],

  // Intents that stop the pipeline and page a human immediately. The model
  // still drafts, but the draft is a summary for the reviewer, not a reply.
  escalateImmediately: ['side_effect_report'],

  // Intents where the cheap tier is the wrong answer no matter what the
  // complexity heuristic says.
  forceModel: {
    billing_dispute: 'claude-opus-5',
    clinical_question: 'claude-opus-5',
    side_effect_report: 'claude-opus-5',
  },
};
