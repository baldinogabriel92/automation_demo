import { route } from './router.js';
import { DEFAULT_POLICY } from './policy.js';
import { Ledger } from './cost.js';

/**
 * One ticket, end to end: classify on the cheap tier, route by cost and risk,
 * draft on the routed tier, gate, and account for every token spent.
 */
export async function triageTicket(ticket, { provider, policy = DEFAULT_POLICY, ledger = new Ledger() } = {}) {
  const started = Date.now();

  const { classification, model: classifierModel, usage: classifyUsage } = await provider.classify(ticket);
  ledger.record({ stage: 'classify', model: classifierModel, usage: classifyUsage });

  const decision = route(classification, policy);

  const { text, model: draftModel, usage: draftUsage } = await provider.draft(ticket, classification, decision);
  ledger.record({ stage: 'draft', model: draftModel, usage: draftUsage });

  const cost =
    ledger.calls.slice(-2).reduce((a, c) => a + c.cost, 0);

  return {
    ticketId: ticket.id,
    classification,
    decision,
    draft: text,
    cost,
    elapsedMs: Date.now() - started,
  };
}

export async function triageBatch(tickets, opts = {}) {
  const ledger = opts.ledger ?? new Ledger();
  const results = [];
  for (const t of tickets) {
    results.push(await triageTicket(t, { ...opts, ledger }));
  }
  return { results, ledger };
}
