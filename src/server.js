import http from 'node:http';
import { handleTicket } from './handler.js';

// Local webhook receiver, so the pipeline can be exercised over HTTP without
// deploying anything:
//   npm run serve
//   curl -X POST localhost:8787/webhook -d @fixtures/zendesk-sample.json

const PORT = Number(process.env.PORT ?? 8787);

http
  .createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/webhook')) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('POST /webhook\n');
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const out = await handleTicket(JSON.parse(raw || '{}'));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out, null, 2));
    } catch (err) {
      res
        .writeHead(500, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: String(err?.message ?? err) }));
    }
  })
  .listen(PORT, () => console.log(`triage webhook listening on http://localhost:${PORT}/webhook`));
