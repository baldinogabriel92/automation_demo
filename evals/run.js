import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider } from '../src/provider.js';
import { triageBatch } from '../src/pipeline.js';
import { usd } from '../src/cost.js';

// Eval harness. Scores the pipeline against labeled tickets and fails the build
// on a regression, so a prompt or policy edit cannot quietly degrade quality.

const here = path.dirname(fileURLToPath(import.meta.url));
const tickets = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'tickets.json'), 'utf8'));
const baselinePath = path.join(here, 'baseline.json');

// A finding that trips this is a release blocker, not a metric to average away.
const TOLERANCE = {
  intentAccuracy: 0.02, // may drop by at most 2 points
  autoResolvePrecision: 0.02,
  escalationRecall: 0.0, // must never drop at all
  avgCostPerTicket: 0.1, // may rise by at most 10%
};

function score(results) {
  const byId = new Map(tickets.map((t) => [t.id, t.labels]));

  let intentHits = 0;
  let autoResolved = 0;
  let autoResolvedCorrect = 0;
  let labeledAutoResolvable = 0;
  let labeledAutoResolvableCaught = 0;
  let sensitiveTotal = 0;
  let sensitiveEscalatedOrHeld = 0;
  const safetyViolations = [];

  for (const r of results) {
    const label = byId.get(r.ticketId);
    if (r.classification.intent === label.intent) intentHits += 1;

    if (label.autoResolvable) {
      labeledAutoResolvable += 1;
      if (r.decision.action === 'auto_resolve') labeledAutoResolvableCaught += 1;
    }
    if (r.decision.action === 'auto_resolve') {
      autoResolved += 1;
      if (label.autoResolvable) autoResolvedCorrect += 1;
      if (label.sensitive) safetyViolations.push(r.ticketId);
    }
    if (label.sensitive) {
      sensitiveTotal += 1;
      if (r.decision.action !== 'auto_resolve') sensitiveEscalatedOrHeld += 1;
    }
  }

  return {
    tickets: results.length,
    intentAccuracy: intentHits / results.length,
    autoResolveRate: autoResolved / results.length,
    autoResolvePrecision: autoResolved === 0 ? 1 : autoResolvedCorrect / autoResolved,
    autoResolveRecall: labeledAutoResolvable === 0 ? 1 : labeledAutoResolvableCaught / labeledAutoResolvable,
    escalationRecall: sensitiveTotal === 0 ? 1 : sensitiveEscalatedOrHeld / sensitiveTotal,
    safetyViolations,
  };
}

function compare(current, baseline) {
  const failures = [];
  const worse = (key, dir = 'down') => {
    const now = current[key];
    const was = baseline[key];
    const delta = dir === 'down' ? was - now : now - was;
    const allowed = dir === 'down' ? TOLERANCE[key] : TOLERANCE[key] * was;
    if (delta > allowed + 1e-9) {
      failures.push(`${key}: ${was.toFixed(4)} -> ${now.toFixed(4)} (allowed slip ${allowed.toFixed(4)})`);
    }
  };
  worse('intentAccuracy');
  worse('autoResolvePrecision');
  worse('escalationRecall');
  worse('avgCostPerTicket', 'up');
  return failures;
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const provider = await getProvider();
  const { results, ledger } = await triageBatch(tickets, { provider });

  const totals = ledger.totals();
  const metrics = {
    ...score(results),
    avgCostPerTicket: totals.spend / tickets.length,
    baselineAvgCostPerTicket: totals.baseline / tickets.length,
    savedPct: totals.savedPct / 100,
  };

  console.log(`\nprovider: ${provider.name}   tickets: ${metrics.tickets}\n`);
  console.log(`  intent accuracy        ${pct(metrics.intentAccuracy)}`);
  console.log(`  auto-resolve rate      ${pct(metrics.autoResolveRate)}`);
  console.log(`  auto-resolve precision ${pct(metrics.autoResolvePrecision)}`);
  console.log(`  auto-resolve recall    ${pct(metrics.autoResolveRecall)}`);
  console.log(`  escalation recall      ${pct(metrics.escalationRecall)}  (sensitive tickets kept away from auto-reply)`);
  console.log(`  cost / ticket          ${usd(metrics.avgCostPerTicket)}  vs ${usd(metrics.baselineAvgCostPerTicket)} all-frontier  (${pct(metrics.savedPct)} saved)\n`);

  if (metrics.safetyViolations.length) {
    console.error(`SAFETY VIOLATION: auto-resolved sensitive tickets: ${metrics.safetyViolations.join(', ')}`);
    process.exit(1);
  }

  if (process.argv.includes('--update-baseline')) {
    fs.writeFileSync(baselinePath, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(`baseline written to ${path.relative(process.cwd(), baselinePath)}`);
    return;
  }

  if (!fs.existsSync(baselinePath)) {
    console.log('no baseline on disk — run `npm run eval:update` to record one');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const failures = compare(metrics, baseline);
  if (failures.length) {
    console.error('REGRESSION vs baseline:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('no regression vs baseline');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
