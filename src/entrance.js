/**
 * STEP 1 — EnTrance.
 * Uses the same `entrancesms` SDK + email/password auth as the local MCP server.
 */

const EntranceAPI = require('entrancesms');
const cfg = require('./config');

const client = new EntranceAPI({ autoLogin: false });
let workspaceId = process.env.ENTRANCE_WORKSPACE_ID || null;

async function login() {
  if (client.accessToken) return;
  const r = await client.login({
    email: process.env.ENTRANCE_EMAIL,
    password: process.env.ENTRANCE_PASSWORD,
  });
  const rec = r && r.record;
  if (!rec || !rec.access_token) {
    throw new Error(`EnTrance login failed: ${r && r.errors ? r.errors.join(', ') : 'unknown'}`);
  }
  client.setAccessToken(rec.access_token);
  if (!workspaceId && rec.workspace_id) workspaceId = String(rec.workspace_id);
}

/** Split a candidate like 'DK163' into its letter and digit halves. */
function parts(code) {
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  return m ? { letters: m[1], digits: m[2] } : null;
}

/** True for legacy families that must stay in the OLDER bucket, never active. */
function isOlder(code) {
  if (cfg.OLDER_CODES.includes(code)) return true;
  const p = parts(code);
  return !!p && cfg.OLDER_PREFIXES.includes(p.letters);
}

function codeOf(name) {
  const upper = String(name || '').toUpperCase().replace(/\s+/g, '');

  // Pinned families win, longest first, so DKCK1 beats DKCK.
  const sorted = [...cfg.ACTIVE_CODES].sort((a, b) => b.length - a.length);
  for (const c of sorted) if (upper.includes(c)) return c;

  // Otherwise take the first letters+digits token that isn't noise or legacy.
  // Only an uppercase prefix is joined across a space, so 'GC 166' reads as
  // GC166 while 'blast 2 of 3' stays prose.
  const joined = String(name || '').replace(/\b([A-Z]{2,4})\s+(\d{1,4})\b/g, '$1$2');
  const re = new RegExp(cfg.NEW_CODE_PATTERN.source, 'gi');
  for (const m of joined.matchAll(re)) {
    const code = m[1].toUpperCase();
    const p = parts(code);
    if (!p) continue;
    if (cfg.NON_CODE_PREFIXES.includes(p.letters)) continue;
    if (isOlder(code)) continue;
    return code;
  }
  return null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Returns { families: [...], splits: [...], unsent: [...] }
 * family = { code, sentAt, sent, delivered, replies, stops, replyPct, stopPct, splits[] }
 */
async function pullEntrance() {
  await login();
  const raw = await client.list({ workspaceId }, { order: 'DESC', limit: 100 });
  const rows = raw.records || raw.data || raw || [];

  const splits = [];
  const unsent = [];

  for (const c of rows) {
    const name = c.name || '';
    const lower = name.toLowerCase();
    const status = String(c.status || '').toLowerCase();
    const contacts = num(c.total_contacts);

    // A campaign left in 'ready' that nevertheless has a sent_at and real
    // delivery numbers stalled mid-send — it still moved real volume.
    const stalled =
      cfg.COUNT_PARTIAL_SENDS && !!c.sent_at && (num(c.delivered) > 0 || num(c.sent) > 0);

    if ((status === 'ready' || status === 'created') && !stalled) {
      unsent.push({ name, contacts, created_at: c.created_at });
      continue;
    }
    if (status !== 'sent' && !stalled) continue;
    if (!c.sent_at || c.sent_at < cfg.WINDOW_START) continue;
    if (cfg.EXCLUDE_CAMPAIGN_WORDS.some((w) => lower.includes(w))) continue;

    const code = codeOf(name);
    // MIN_CONTACTS is a junk filter for unrecognized names only. A recognized
    // code is a real campaign regardless of how small the split was.
    if (!code) continue;
    if (contacts < cfg.MIN_CONTACTS && !cfg.ACTIVE_CODES.includes(code)) continue;

    splits.push({
      code,
      name,
      sentAt: String(c.sent_at).slice(0, 10),
      sent: contacts,
      delivered: num(c.delivered),
      replies: num(c.response),
      stops: num(c.stop),
      partial: stalled && status !== 'sent',
    });
  }

  const byCode = new Map();
  for (const s of splits) {
    if (!byCode.has(s.code)) {
      byCode.set(s.code, {
        code: s.code, sentAt: s.sentAt,
        sent: 0, delivered: 0, replies: 0, stops: 0, splits: [],
      });
    }
    const f = byCode.get(s.code);
    f.sent += s.sent;
    f.delivered += s.delivered;
    f.replies += s.replies;
    f.stops += s.stops;
    f.splits.push(s);
    if (s.sentAt > f.sentAt) f.sentAt = s.sentAt; // family date = newest split
  }

  const families = [...byCode.values()].map((f) => ({
    ...f,
    replyPct: f.delivered ? f.replies / f.delivered : 0,
    stopPct: f.delivered ? f.stops / f.delivered : 0,
  }));
  families.sort((a, b) => a.sentAt.localeCompare(b.sentAt));

  return { families, splits, unsent };
}

module.exports = { pullEntrance, codeOf, isOlder };
