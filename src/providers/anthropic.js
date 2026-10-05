import { CLASSIFIER_MODEL, modelOrThrow } from '../models.js';
import { INTENTS } from '../policy.js';

// Live provider. Imported lazily so mock mode runs with no node_modules.
let client = null;
async function getClient() {
  if (client) return client;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic(); // resolves ANTHROPIC_API_KEY / auth profile from env
  return client;
}

const CLASSIFIER_SYSTEM = `You triage inbound member support tickets for a telehealth and wellness company.
Classify the ticket. Be conservative: if the ticket touches dosage, symptoms, side effects, or anything a
clinician should answer, say so and mark it not auto-resolvable. Report your true confidence - a low number
is useful signal, an inflated one is not.`;

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
    urgency: { type: 'string', enum: ['normal', 'high'] },
    autoResolvable: {
      type: 'boolean',
      description: 'True only if a templated reply fully resolves this with no human judgment.',
    },
    confidence: { type: 'number', description: '0 to 1, your calibrated confidence in the intent label.' },
  },
  required: ['intent', 'complexity', 'urgency', 'autoResolvable', 'confidence'],
  additionalProperties: false,
};

const usageOf = (res) => ({
  inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0),
  outputTokens: res.usage.output_tokens,
});

const textOf = (res) =>
  res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

export const anthropicProvider = {
  name: 'anthropic',

  async classify(ticket) {
    const api = await getClient();
    const res = await api.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 1024, // classification is a short, constrained output
      system: CLASSIFIER_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: CLASSIFICATION_SCHEMA } },
      messages: [
        { role: 'user', content: `Subject: ${ticket.subject}\n\nBody:\n${ticket.body}` },
      ],
    });

    if (res.stop_reason === 'refusal') throw new Error('Classifier request was declined by safety classifiers.');

    return {
      classification: JSON.parse(textOf(res)),
      model: CLASSIFIER_MODEL,
      usage: usageOf(res),
    };
  },

  async draft(ticket, classification, decision) {
    const api = await getClient();
    const model = modelOrThrow(decision.model) && decision.model;

    const system =
      decision.action === 'escalate'
        ? `Write a short internal summary for the clinician who will handle this ticket. Do not write a reply to the member. State what was reported, when, and what the reviewer should check first.`
        : `Write a reply to a member of a telehealth and wellness service. Be direct and warm. Answer the question asked, state the next step, and do not invent order numbers, dates, or clinical advice. If something needs a human, say so plainly.`;

    const output_config = {};
    if (decision.effort) output_config.effort = decision.effort;

    const res = await api.messages.create({
      model,
      max_tokens: model === 'claude-opus-5' ? 4096 : 2048,
      system,
      ...(Object.keys(output_config).length ? { output_config } : {}),
      messages: [
        {
          role: 'user',
          content: `Ticket intent: ${classification.intent} (urgency: ${classification.urgency})\n\nSubject: ${ticket.subject}\n\nBody:\n${ticket.body}`,
        },
      ],
    });

    if (res.stop_reason === 'refusal') throw new Error('Draft request was declined by safety classifiers.');

    return { text: textOf(res), model, usage: usageOf(res) };
  },
};
