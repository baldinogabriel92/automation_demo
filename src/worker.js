import { handleTicket } from './handler.js';

// Cloudflare Worker entry. Same handler as the Node server — only the
// transport differs. Deploy with: wrangler deploy
//
// In live mode the Worker needs ANTHROPIC_API_KEY bound as a secret:
//   wrangler secret put ANTHROPIC_API_KEY

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST a Zendesk ticket payload\n', { status: 405 });
    }

    // Verify the webhook before doing any model work. Zendesk signs deliveries;
    // an unauthenticated endpoint here is an open invitation to burn your
    // token budget. Set WEBHOOK_SECRET to enforce it.
    if (env.WEBHOOK_SECRET && request.headers.get('x-webhook-secret') !== env.WEBHOOK_SECRET) {
      return new Response('unauthorized\n', { status: 401 });
    }

    try {
      const payload = await request.json();
      const out = await handleTicket(payload, { mode: env.MODE ?? 'mock' });
      return Response.json(out);
    } catch (err) {
      return Response.json({ error: String(err?.message ?? err) }, { status: 500 });
    }
  },
};
