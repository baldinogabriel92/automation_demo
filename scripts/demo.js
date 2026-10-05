import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider } from '../src/provider.js';
import { triageBatch } from '../src/pipeline.js';
import { usd } from '../src/cost.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const all = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'tickets.json'), 'utf8'));

// A spread that shows every branch: cheap auto-resolve, mid-tier draft,
// frontier draft on a money dispute, and a clinical escalation.
const PICKS = ['T-1001', 'T-1008', 'T-1013', 'T-1018', 'T-1022', 'T-1025', 'T-1027'];
const tickets = PICKS.map((id) => all.find((t) => t.id === id));

const ACTION_LABEL = {
  auto_resolve: 'AUTO-RESOLVE',
  draft_for_agent: 'DRAFT FOR AGENT',
  escalate: 'ESCALATE',
};

const provider = await getProvider();
const { results, ledger } = await triageBatch(tickets, { provider });

console.log(`\nmode: ${provider.name}\n`);

for (const r of results) {
  const t = tickets.find((x) => x.id === r.ticketId);
  console.log(`${r.ticketId}  "${t.subject}"`);
  console.log(`  intent      ${r.classification.intent} (confidence ${r.classification.confidence.toFixed(2)}, urgency ${r.classification.urgency})`);
  console.log(`  routed to   ${r.decision.model}${r.decision.effort ? ` @ effort=${r.decision.effort}` : ''}`);
  console.log(`  action      ${ACTION_LABEL[r.decision.action]}`);
  for (const reason of r.decision.reasons) console.log(`              - ${reason}`);
  console.log(`  cost        ${usd(r.cost)}`);
  console.log('');
}

const totals = ledger.totals();
console.log('spend');
for (const [model, s] of Object.entries(totals.byModel)) {
  console.log(`  ${model.padEnd(20)} ${String(s.calls).padStart(2)} calls   ${usd(s.cost)}`);
}
console.log(`  ${'TOTAL'.padEnd(20)}    ${' '}      ${usd(totals.spend)}`);
console.log(`  all-frontier baseline      ${usd(totals.baseline)}`);
console.log(`  saved by routing           ${usd(totals.saved)}  (${totals.savedPct.toFixed(1)}%)\n`);
