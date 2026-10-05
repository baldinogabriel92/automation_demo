import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../src/router.js';
import { DEFAULT_POLICY } from '../src/policy.js';

// These drive route() directly with synthetic classifications, including ones a
// real classifier should never produce. The ticket-level eval cannot cover this:
// it only sees what the classifier actually emits, so a policy rule that never
// fires on the fixture set would look "passing" while protecting nothing.

const classification = (over = {}) => ({
  intent: 'order_status',
  complexity: 'low',
  urgency: 'normal',
  autoResolvable: true,
  confidence: 0.95,
  ...over,
});

test('a confident classifier cannot auto-resolve a clinical question', () => {
  const d = route(classification({ intent: 'clinical_question', confidence: 0.99 }));
  assert.notEqual(d.action, 'auto_resolve');
  assert.equal(d.autoResolve, false);
});

test('a confident classifier cannot auto-resolve an adverse event report', () => {
  const d = route(classification({ intent: 'side_effect_report', confidence: 0.99 }));
  assert.equal(d.action, 'escalate');
  assert.equal(d.autoResolve, false);
});

test('money intents are never auto-resolved, however confident', () => {
  for (const intent of ['billing_dispute', 'refund']) {
    const d = route(classification({ intent, confidence: 1 }));
    assert.equal(d.autoResolve, false, `${intent} must not auto-resolve`);
  }
});

test('low confidence blocks auto-resolve even on a safe intent', () => {
  const below = DEFAULT_POLICY.autoResolveMinConfidence - 0.01;
  const d = route(classification({ confidence: below }));
  assert.equal(d.action, 'draft_for_agent');
});

test('high-risk intents are forced onto the frontier tier regardless of complexity', () => {
  const d = route(classification({ intent: 'billing_dispute', complexity: 'low' }));
  assert.equal(d.model, 'claude-opus-5');
});

test('simple safe tickets still take the cheap tier', () => {
  const d = route(classification());
  assert.equal(d.model, 'claude-haiku-4-5');
  assert.equal(d.action, 'auto_resolve');
});

test('effort is never set on a model that rejects the parameter', () => {
  const d = route(classification());
  assert.equal(d.model, 'claude-haiku-4-5');
  assert.equal(d.effort, null); // Haiku 4.5 errors if effort is sent
});

test('every decision explains itself', () => {
  const d = route(classification({ intent: 'clinical_question' }));
  assert.ok(d.reasons.length > 0);
  assert.ok(d.reasons.some((r) => r.includes('clinical_question')));
});
