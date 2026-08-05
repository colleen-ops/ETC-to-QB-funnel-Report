/**
 * STEP 5 — build the canvas. Tables ONLY. Zero notes, zero explanation text.
 */

const cfg = require('./config');

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (n) => (n * 100).toFixed(1) + '%';
const int = (n) => Number(n || 0).toLocaleString('en-US');

function table(headers, rows) {
  const out = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  return out.join('\n');
}

const isActive = (m) => m.code && m.code !== 'OLDER';
const isOlder = (m) => m.code === 'OLDER';

/** A) Campaigns */
function tableA(families, merchants) {
  const applied = (code) => merchants.filter((m) => m.code === code).length;
  const funded = (code) => merchants.filter((m) => m.code === code && m.funded);

  const rows = families.map((f) => {
    const fm = funded(f.code);
    return [
      `${f.code} (${f.sentAt})`,
      int(f.sent), int(f.replies), pct(f.replyPct), int(f.stops),
      int(applied(f.code)), int(fm.length),
      usd(fm.reduce((s, m) => s + m.amount, 0)),
      usd(fm.reduce((s, m) => s + m.revenue, 0)),
    ];
  });

  const olderApplied = merchants.filter(isOlder);
  const olderFunded = olderApplied.filter((m) => m.funded);
  const allApplied = merchants.filter((m) => m.code);
  const allFunded = allApplied.filter((m) => m.funded);

  const sum = (k) => families.reduce((s, f) => s + f[k], 0);
  const totalDelivered = sum('delivered');

  // TOTAL row: SMS columns cover June+ families only (Older has no SMS data).
  // Applied/Funded/$ columns include Older, so TOTAL is the whole funnel.
  rows.push([
    '**TOTAL**', `**${int(sum('sent'))}**`, `**${int(sum('replies'))}**`,
    `**${pct(totalDelivered ? sum('replies') / totalDelivered : 0)}**`,
    `**${int(sum('stops'))}**`, `**${int(allApplied.length)}**`, `**${int(allFunded.length)}**`,
    `**${usd(allFunded.reduce((s, m) => s + m.amount, 0))}**`,
    `**${usd(allFunded.reduce((s, m) => s + m.revenue, 0))}**`,
  ]);

  rows.push([
    'Older campaigns', '—', '—', '—', '—',
    int(olderApplied.length), int(olderFunded.length),
    usd(olderFunded.reduce((s, m) => s + m.amount, 0)),
    usd(olderFunded.reduce((s, m) => s + m.revenue, 0)),
  ]);

  return table(
    ['Campaign (sent)', '📤 Sent', '💬 Replies', 'Reply %', '🛑 Stops',
     '📥 Applied', '✅ Funded', '💵 Funded $', 'Revenue'],
    rows
  );
}

/** B) Where They Stand */
function tableB(families, merchants) {
  const cols = cfg.STAGE_RANK.map((s) => s.label);

  const line = (label, list) => {
    const counts = cols.map((c) => list.filter((m) => m.bestLabel === c).length);
    return [label, ...counts.map(int), `**${int(counts.reduce((a, b) => a + b, 0))}**`];
  };

  const rows = families.map((f) => line(f.code, merchants.filter((m) => m.code === f.code)));
  rows.push(line('Older campaigns', merchants.filter(isOlder)));

  const all = merchants.filter((m) => m.code);
  const totals = cols.map((c) => all.filter((m) => m.bestLabel === c).length);
  rows.push([
    '**TOTAL**', ...totals.map((n) => `**${int(n)}**`),
    `**${int(totals.reduce((a, b) => a + b, 0))}**`,
  ]);

  return table(
    ['Campaign', '✅ Funded', '👍 Approved', '🔀 Went Elsewhere', '📄 Needs Info',
     '🙅 Said No To Us', '❌ We Declined', 'Total'],
    rows
  );
}

/** C) Funded Deals — every funded merchant carrying a campaign code, June+ and older. */
function tableC(merchants) {
  const list = merchants
    .filter((m) => m.funded && m.code)
    .sort((a, b) => b.amount - a.amount);

  const rows = list.map((m) => [
    `[${m.dba}](${cfg.QB.RECORD_URL(m.bestRecordId)})`,
    usd(m.amount),
    (m.sourceFromClose ? '⚠️ ' : '') + (m.source || '—'),
    m.lender, m.rep,
    m.fundedDate || 'no date',
    m.touches == null ? '—' : int(m.touches),
    m.daysToFund == null ? '—' : int(m.daysToFund),
  ]);

  return table(
    ['🏢 Business', '💵 $', '🎯 Came From', '🏦 Lender', '🧑 Rep', '📅 Date', '📞 Touches', 'Days to Fund'],
    rows
  );
}

/** D) Non Renewal Monthly Money — ALL funded merchants, every source. */
function tableD(merchants) {
  const funded = merchants.filter((m) => m.funded);
  const months = [...new Set(funded.map((m) => m.fundedMonth).filter(Boolean))].sort();

  const rows = months.map((ym) => {
    const list = funded.filter((m) => m.fundedMonth === ym);
    const total = list.reduce((s, m) => s + m.amount, 0);
    const campaign = list.filter((m) => m.code).reduce((s, m) => s + m.amount, 0);

    const bySource = new Map();
    for (const m of list) {
      const k = m.source || 'No source';
      bySource.set(k, (bySource.get(k) || 0) + m.amount);
    }
    const top3 = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([s, v]) => `${s} $${Math.round(v / 1000)}K`).join(' · ');

    const label = new Date(`${ym}-01T00:00:00Z`)
      .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    return [label, int(list.length), usd(total), usd(campaign),
            total ? Math.round((campaign / total) * 100) + '%' : '0%', top3 || '—'];
  });

  const total = funded.reduce((s, m) => s + m.amount, 0);
  const campaign = funded.filter((m) => m.code).reduce((s, m) => s + m.amount, 0);
  rows.push([
    '**TOTAL**', `**${int(funded.length)}**`, `**${usd(total)}**`, `**${usd(campaign)}**`,
    `**${total ? Math.round((campaign / total) * 100) + '%' : '0%'}**`, '—',
  ]);

  return table(['Month', '✅ Deals', '💵 Total $', '🎯 Campaign $', 'Campaign %', 'Top 3 Sources'], rows);
}

function buildCanvas(runDate, families, merchants) {
  return [
    `# Getty Weekly Funnel — ${runDate}`, '',
    '## A) Campaigns', '', tableA(families, merchants), '',
    '## B) Where They Stand', '', tableB(families, merchants), '',
    '## C) Funded Deals', '', tableC(merchants), '',
    '## D) Non Renewal Monthly Money', '', tableD(merchants), '',
  ].join('\n');
}

/** STEP 6 — the 4-line channel post. */
function buildPost(families, merchants) {
  const funded = merchants.filter((m) => m.funded);
  const campaignFunded = funded.filter((m) => m.code);
  const missing = merchants.filter((m) => m.missingTag);
  const best = [...families].sort((a, b) => b.replyPct - a.replyPct)[0];
  const tags = cfg.SLACK.TAG_IDS.map((id) => `<@${id}>`).join(' ');

  return [
    tags,
    `Funded: ${funded.length} merchants, ${usd(funded.reduce((s, m) => s + m.amount, 0))}`,
    `From campaigns: ${campaignFunded.length}, ${usd(campaignFunded.reduce((s, m) => s + m.amount, 0))} — missing tags: ${missing.length}`,
    best ? `Best campaign: ${best.code} ${pct(best.replyPct)}` : 'Best campaign: —',
  ].join('\n');
}

module.exports = { buildCanvas, buildPost };
