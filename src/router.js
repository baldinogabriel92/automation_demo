import { DEFAULT_POLICY } from './policy.js';
import { modelOrThrow } from './models.js';

/**
 * Pure routing decision. No I/O, no model calls — so it is trivially testable
 * and the eval harness can replay it over thousands of tickets for free.
 *
 * @param {{intent: string, complexity: 'low'|'medium'|'high', autoResolvable: boolean, confidence: number}} c
 * @param {object} [policy]
 * @returns {{model: string, effort: string|null, action: string, autoResolve: boolean, reasons: string[]}}
 */
export function route(c, policy = DEFAULT_POLICY) {
  const reasons = [];

  let model = policy.modelByComplexity[c.complexity] ?? 'claude-sonnet-5';
  reasons.push(`complexity=${c.complexity} -> ${model}`);

  const forced = policy.forceModel[c.intent];
  if (forced && forced !== model) {
    reasons.push(`intent=${c.intent} forces ${forced}`);
    model = forced;
  }
  modelOrThrow(model);

  const effort = policy.effortByModel[model] ?? null;

  const escalate = policy.escalateImmediately.includes(c.intent);
  if (escalate) reasons.push(`intent=${c.intent} escalates to a human immediately`);

  let autoResolve = c.autoResolvable;
  if (autoResolve && policy.neverAutoResolve.includes(c.intent)) {
    autoResolve = false;
    reasons.push(`intent=${c.intent} is never auto-resolved`);
  }
  if (autoResolve && c.confidence < policy.autoResolveMinConfidence) {
    autoResolve = false;
    reasons.push(
      `confidence ${c.confidence.toFixed(2)} below ${policy.autoResolveMinConfidence} gate`,
    );
  }
  if (autoResolve && escalate) autoResolve = false;

  const action = escalate ? 'escalate' : autoResolve ? 'auto_resolve' : 'draft_for_agent';

  return { model, effort, action, autoResolve, reasons };
}
