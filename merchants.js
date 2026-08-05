/**
 * STEPS 2 (build half) + 3.
 * ONE counting standard: merchants (distinct field 208), never deal rows.
 */

const cfg = require('./config');
const F = cfg.QB.F;

const rankOf = (status) => {
  const i = cfg.STAGE_RANK.findIndex((s) => s.status === status);
  return i === -1 ? 999 : i; // lower index = better stage
};

const labelOf = (status) => {
  const s = cfg.STAGE_RANK.find((x) => x.status === status);
  return s ? s.label : null;
};

const firstNonBlank = (rows, field) => {
  for (const r of rows) {
    const v = r[field];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return null;
};

const money = (v) => {
  const n = Number(String(v ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const ymd = (v) => (v ? String(v).slice(0, 10) : null);

/** Build one record per merchant from raw QB rows. */
function buildMerchants(qbRows) {
  const groups = new Map();
  for (const r of qbRows) {
    const key = String(r[F.LEAD_RECORD_ID] ?? '').trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const merchants = [];

  for (const [leadRecordId, rows] of groups) {
    const best = rows.reduce((a, b) =>
      rankOf(a[F.STATUS]) <= rankOf(b[F.STATUS]) ? a : b
    );

    const m = {
      leadRecordId,
      rows,
      dba: firstNonBlank(rows, F.DBA) || '(no name)',
      dealId: firstNonBlank(rows, F.DEAL_ID),
      source: firstNonBlank(rows, F.SOURCE),
      sourceFromClose: false,
      phones: [F.PHONE_A, F.PHONE_B, F.PHONE_C].map((f) => firstNonBlank(rows, f)).filter(Boolean),
      bestStatus: best[F.STATUS],
      bestLabel: labelOf(best[F.STATUS]),
      bestRecordId: best[F.RECORD_ID],
      missingOldTag: rows.every((r) => !String(r[F.OLD_TAG] ?? '').trim()),
      funded: false,
      flags: [],
    };

    // FUNDED is decided by STATUS, never by a funded-date filter.
    if (m.bestStatus === 'Funded') {
      const fundedRows = rows.filter((r) => r[F.STATUS] === 'Funded');
      const top = fundedRows.reduce((a, b) =>
        money(a[F.FUNDED_AMT]) >= money(b[F.FUNDED_AMT]) ? a : b
      );

      m.funded = true;
      m.amount = money(top[F.FUNDED_AMT]);
      m.revenue = money(top[F.REVENUE]);
      m.lender = top[F.LENDER] || '—';
      m.rep = top[F.REP] || '—';
      m.bestRecordId = top[F.RECORD_ID];

      const fd = ymd(top[F.FUNDED_DATE]);
      if (fd) {
        m.fundedDate = fd;
      } else {
        m.fundedDate = null;
        m.flags.push('no funded date');
      }
      // Month falls back to the submitted date when funded date is blank.
      m.fundedMonth = (fd || ymd(top[F.SUBMITTED]) || '').slice(0, 7) || null;
    }

    merchants.push(m);
  }

  return merchants;
}

/**
 * Attach a campaign code to each merchant from its source string.
 * Returns 'OLDER' for legacy codes, or null for no code.
 */
function classifySource(source, activeCodes) {
  if (!source) return null;
  const s = String(source).toUpperCase().replace(/\s+/g, '');

  const active = [...new Set(activeCodes)].sort((a, b) => b.length - a.length);
  for (const c of active) if (s.includes(c)) return c;

  for (const c of cfg.OLDER_CODES) if (s.includes(c)) return 'OLDER';
  for (const p of cfg.OLDER_PREFIXES) if (new RegExp(`\\b${p}\\d`).test(s) || s.includes(p)) return 'OLDER';

  return null;
}

/** Month-end string for a YYYY-MM value. */
function monthEnd(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * STEP 3 — decide credit.
 * A campaign only gets a funded merchant if the code matches AND the campaign
 * was sent on or before the end of the funded month.
 */
function assignCredit(merchants, families) {
  const codes = families.map((f) => f.code);
  const sentAt = new Map(families.map((f) => [f.code, f.sentAt]));

  for (const m of merchants) {
    m.code = classifySource(m.source, codes);

    if (m.funded && m.code && m.code !== 'OLDER') {
      const end = monthEnd(m.fundedMonth);
      const campaignSent = sentAt.get(m.code);
      if (end && campaignSent && campaignSent > end) {
        m.code = null; // campaign went out after the money landed — no credit
        m.flags.push('campaign sent after funded month');
      }
    }

    // MISSING TAG = campaign merchant with a blank 537, or source only in Close.
    m.missingTag = !!m.code && (m.missingOldTag || m.sourceFromClose);
  }

  return merchants;
}

module.exports = { buildMerchants, assignCredit, classifySource, monthEnd, money };
