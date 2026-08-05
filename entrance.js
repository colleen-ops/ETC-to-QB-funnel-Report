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

function codeOf(name) {
  const upper = String(name || '').toUpperCase().replace(/\s+/g, '');
  const sorted = [...cfg.ACTIVE_CODES].sort((a, b) => b.length - a.length);
  for (const c of sorted) if (upper.includes(c)) return c;
  const m = String(name || '').match(cfg.NEW_CODE_PATTERN);
  return m ? m[1].toUpperCase() : null;
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

    if (status === 'ready' || status === 'created') {
      unsent.push({ name, contacts, created_at: c.created_at });
      continue;
    }
    if (status !== 'sent') continue;
    if (!c.sent_at || c.sent_at < cfg.WINDOW_START) continue;
    if (cfg.EXCLUDE_CAMPAIGN_WORDS.some((w) => lower.includes(w))) continue;
    if (contacts < cfg.MIN_CONTACTS) continue;

    const code = codeOf(name);
    if (!code) continue;

    splits.push({
      code,
      name,
      sentAt: String(c.sent_at).slice(0, 10),
      sent: contacts,
      delivered: num(c.delivered),
      replies: num(c.response),
      stops: num(c.stop),
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

module.exports = { pullEntrance, codeOf };
