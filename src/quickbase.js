/**
 * STEP 2 (pull half) — QuickBase.
 * ONE paginated query. Non-renewals, submitted on/after the window start.
 */

const cfg = require('./config');

const API = 'https://api.quickbase.com/v1/records/query';

function headers() {
  return {
    'QB-Realm-Hostname': cfg.QB.REALM,
    Authorization: `QB-USER-TOKEN ${process.env.QB_USER_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function whereClause() {
  const [y, m, d] = cfg.WINDOW_START.split('-');
  return `{${cfg.QB.F.RENEWAL}.EX.'0'}AND{${cfg.QB.F.SUBMITTED}.OAF.'${m}-${d}-${y}'}`;
}

async function pullQuickbase() {
  const rows = [];
  let skip = 0;
  const top = 1000;

  for (;;) {
    const res = await fetch(API, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        from: cfg.QB.TABLE,
        select: cfg.QB.SELECT,
        where: whereClause(),
        options: { skip, top },
      }),
    });

    if (!res.ok) {
      throw new Error(`QuickBase ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const json = await res.json();
    const batch = json.data || [];
    for (const r of batch) {
      const flat = {};
      for (const [fid, cell] of Object.entries(r)) flat[fid] = cell.value;
      rows.push(flat);
    }

    const meta = json.metadata || {};
    skip += batch.length;
    if (batch.length === 0 || skip >= (meta.totalRecords || 0)) break;
  }

  return rows;
}

module.exports = { pullQuickbase };
