/**
 * STEP 4 — Close.
 * Targeted lookups ONLY. No wildcard searches (they throttle for ~2.5h).
 * Lookup order: QB Deal ID -> DBA name -> phone.
 */

const cfg = require('./config');

const BASE = 'https://api.close.com/api/v1';

function auth() {
  const key = process.env.CLOSE_API_KEY || '';
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
  });

  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get('retry-after') || 0) * 1000 || 2000 * (attempt + 1);
    await sleep(wait);
    return get(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Close ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);

  await sleep(350); // stay polite
  return res.json();
}

const q = (s) => encodeURIComponent(s);

function digits(p) {
  return String(p || '').replace(/\D/g, '');
}

/** Returns the Close lead object, or null. */
async function findLead({ dealId, dba, phones = [] }) {
  if (dealId) {
    const r = await get(`/lead/?query=${q(`custom.${cfg.CLOSE.DEAL_ID_FIELD}:"${dealId}"`)}&_limit=1`);
    if (r.data && r.data.length) return r.data[0];
  }

  if (dba) {
    const r = await get(`/lead/?query=${q(`name:"${dba}"`)}&_limit=5`);
    const hit = (r.data || []).find(
      (l) => String(l.display_name || '').trim().toLowerCase() === String(dba).trim().toLowerCase()
    );
    if (hit) return hit;
  }

  for (const p of phones) {
    const d = digits(p);
    if (d.length < 10) continue;
    const r = await get(`/lead/?query=${q(`phone:"${d}"`)}&_limit=5`);
    const hit = (r.data || []).find(
      (l) => !dba || String(l.display_name || '').trim().toLowerCase() === String(dba).trim().toLowerCase()
    );
    if (hit) return hit; // last resort, confirmed by DBA
  }

  return null;
}

function leadSource(lead) {
  if (!lead) return null;
  const v = lead[`custom.${cfg.CLOSE.LEAD_SOURCE_FIELD}`] ?? (lead.custom || {})[cfg.CLOSE.LEAD_SOURCE_FIELD];
  return v ? String(v) : null;
}

/**
 * Touches (calls/SMS/emails) on or before the funded date, plus days-to-fund.
 * If fundedDate is blank, no date cap.
 */
async function leadTouches(leadId, fundedDate) {
  const r = await get(`/activity/?lead_id=${leadId}&_limit=${cfg.CLOSE.MAX_ACTIVITIES_PER_LEAD}`);
  const acts = r.data || [];
  const countable = new Set(['Call', 'SMS', 'Email']);

  const relevant = acts.filter((a) => {
    if (!countable.has(a._type)) return false;
    if (!fundedDate) return true;
    return String(a.date_created || '').slice(0, 10) <= fundedDate;
  });

  let daysToFund = null;
  if (fundedDate && relevant.length) {
    const first = relevant
      .map((a) => String(a.date_created || '').slice(0, 10))
      .filter(Boolean)
      .sort()[0];
    if (first) {
      daysToFund = Math.max(
        0,
        Math.round((new Date(fundedDate) - new Date(first)) / 86400000)
      );
    }
  }

  return { touches: relevant.length, daysToFund };
}

module.exports = { findLead, leadSource, leadTouches };
