import { estimateTokens } from '../cost.js';
import { CLASSIFIER_MODEL } from '../models.js';

// Deterministic stand-in for the model calls, so the whole pipeline — routing,
// gating, evals, cost accounting — runs with no API key and no network.
// The heuristics below are deliberately imperfect: a classifier that scored
// 100% would make the eval harness meaningless.

const RULES = [
  { intent: 'side_effect_report', re: /\b(side effect|reaction|rash|dizzy|nausea|palpitation|adverse)\b/i, complexity: 'high', auto: false, conf: 0.93 },
  { intent: 'clinical_question', re: /\b(dosage|dose|mg\b|interact|prescription|titrat|blood work|lab result|safe to take)\b/i, complexity: 'high', auto: false, conf: 0.88 },
  { intent: 'billing_dispute', re: /\b(charged twice|double charge|unauthorized|dispute|chargeback|wrong amount)\b/i, complexity: 'high', auto: false, conf: 0.9 },
  { intent: 'refund', re: /\b(refund|money back|reimburse)\b/i, complexity: 'medium', auto: false, conf: 0.85 },
  { intent: 'subscription_cancel', re: /\b(cancel|stop my (plan|subscription)|end my membership)\b/i, complexity: 'medium', auto: false, conf: 0.84 },
  { intent: 'subscription_pause', re: /\b(pause|skip (a |my )?(month|shipment)|hold my)\b/i, complexity: 'low', auto: true, conf: 0.86 },
  { intent: 'account_access', re: /\b(log ?in|password|reset|locked out|2fa|verification code)\b/i, complexity: 'low', auto: true, conf: 0.89 },
  { intent: 'shipping_change', re: /\b(change (my )?address|wrong address|reroute|move my delivery)\b/i, complexity: 'low', auto: true, conf: 0.87 },
  { intent: 'order_status', re: /\b(where is|tracking|shipped|delivery date|order status|hasn't arrived|has not arrived)\b/i, complexity: 'low', auto: true, conf: 0.91 },
  { intent: 'product_question', re: /\b(what is|how does|ingredient|how long until|difference between|do you offer)\b/i, complexity: 'low', auto: true, conf: 0.78 },
];

const URGENT = /\b(urgent|asap|emergency|immediately|right now)\b/i;

export const mockProvider = {
  name: 'mock',

  async classify(ticket) {
    const text = `${ticket.subject}\n${ticket.body}`;
    const hit = RULES.find((r) => r.re.test(text));

    const classification = hit
      ? { intent: hit.intent, complexity: hit.complexity, autoResolvable: hit.auto, confidence: hit.conf }
      : // No rule matched. Admit low confidence rather than guessing — the
        // confidence gate then routes it to a human, which is the safe default.
        { intent: 'product_question', complexity: 'medium', autoResolvable: false, confidence: 0.41 };

    // Long or multi-question tickets are harder than their intent suggests.
    if (ticket.body.length > 420 || (ticket.body.match(/\?/g) || []).length >= 3) {
      if (classification.complexity === 'low') classification.complexity = 'medium';
      classification.autoResolvable = false;
      classification.confidence = Math.max(0.5, classification.confidence - 0.2);
    }

    classification.urgency = URGENT.test(text) ? 'high' : 'normal';

    return {
      classification,
      model: CLASSIFIER_MODEL,
      usage: { inputTokens: estimateTokens(text) + 180, outputTokens: 60 },
    };
  },

  async draft(ticket, classification, decision) {
    const text =
      decision.action === 'escalate'
        ? `[REVIEWER SUMMARY] Member reports a possible adverse reaction. Intent=${classification.intent}, urgency=${classification.urgency}. Do not auto-reply; route to the clinical team.`
        : `Hi ${ticket.member ?? 'there'} — thanks for reaching out about your ${classification.intent.replace(/_/g, ' ')}. ` +
          `Here is what I can confirm, and the next step on our side.`;

    const outputTokens = decision.model === 'claude-opus-5' ? 320 : decision.model === 'claude-sonnet-5' ? 220 : 140;
    return {
      text,
      model: decision.model,
      usage: {
        inputTokens: estimateTokens(`${ticket.subject}\n${ticket.body}`) + 420,
        outputTokens,
      },
    };
  },
};
