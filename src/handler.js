import { getProvider } from './provider.js';
import { triageTicket } from './pipeline.js';

// Transport-agnostic core. server.js (Node) and worker.js (Cloudflare) both
// wrap this — no runtime-specific imports here.

export function normalizeZendesk(payload) {
  const t = payload.ticket ?? payload;
  return {
    id: String(t.id ?? 'unknown'),
    subject: t.subject ?? '',
    body: t.description ?? t.body ?? t.comment?.body ?? '',
    member: t.requester?.name ?? t.via?.source?.from?.name ?? null,
  };
}

export async function handleTicket(payload, { mode } = {}) {
  const provider = await getProvider(mode);
  const ticket = normalizeZendesk(payload);
  const result = await triageTicket(ticket, { provider });
  return {
    ticket_id: result.ticketId,
    action: result.decision.action,
    model: result.decision.model,
    intent: result.classification.intent,
    confidence: result.classification.confidence,
    reasons: result.decision.reasons,
    draft: result.draft,
    cost_usd: Number(result.cost.toFixed(6)),
  };
}
