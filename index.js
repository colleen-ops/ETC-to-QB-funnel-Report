#!/usr/bin/env node
/**
 * Getty Weekly Funnel Report.
 *
 * Three output modes:
 *   (default)      build + post to Slack directly    -> needs SLACK_BOT_TOKEN
 *   OUTPUT_DIR=out write report.md + post.txt, no Slack -> no Slack token needed
 *   DRY_RUN=1      print to stdout, touch nothing
 */

const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { pullEntrance } = require('./entrance');
const { pullQuickbase } = require('./quickbase');
const { findLead, leadSource, leadTouches } = require('./close');
const { buildMerchants, assignCredit } = require('./merchants');
const { buildCanvas, buildPost } = require('./render');
const slack = require('./slack');

const F = cfg.QB.F;
const problems = [];
const note = (msg) => { problems.push(msg); console.error('[warn]', msg); };

async function main() {
  const runDate = new Date().toISOString().slice(0, 10);
  const dryRun = process.env.DRY_RUN === '1';

  // --- Step 1 -------------------------------------------------------------
  let families = [];
  try {
    ({ families } = await pullEntrance());
    console.log(`[entrance] ${families.length} campaign families`);
  } catch (e) {
    note(`EnTrance pull failed: ${e.message}`);
  }

  // --- Step 2 -------------------------------------------------------------
  const qbRows = await pullQuickbase(); // hard fail — nothing works without this
  console.log(`[quickbase] ${qbRows.length} deal rows`);
  const merchants = buildMerchants(qbRows);
  console.log(`[merchants] ${merchants.length} distinct merchants`);

  // --- Blank-source fix (capped) -----------------------------------------
  const blanks = merchants
    .filter((m) => !m.source)
    .sort((a, b) => String(b.bestRecordId).localeCompare(String(a.bestRecordId)));

  const doNow = blanks.slice(0, cfg.CLOSE.MAX_BLANK_SOURCE_LOOKUPS);
  if (blanks.length > doNow.length) {
    note(`${blanks.length - doNow.length} blank-source merchants skipped (30/run cap)`);
  }

  for (const m of doNow) {
    try {
      const lead = await findLead({ dealId: m.dealId, dba: m.dba, phones: m.phones });
      const src = leadSource(lead);
      if (src) {
        m.source = src;
        m.sourceFromClose = true;
        m.closeLeadId = lead.id;
      }
    } catch (e) {
      note(`Close lookup failed for ${m.dba}: ${e.message}`);
    }
  }

  // --- Step 3 -------------------------------------------------------------
  assignCredit(merchants, families);

  // --- Step 4: touches for funded merchants only --------------------------
  for (const m of merchants.filter((x) => x.funded)) {
    try {
      let leadId = m.closeLeadId;
      if (!leadId) {
        const lead = await findLead({ dealId: m.dealId, dba: m.dba, phones: m.phones });
        if (!lead) continue;
        leadId = lead.id;
        // Close wins when the two systems disagree on source.
        const src = leadSource(lead);
        if (src && src !== m.source) { m.source = src; m.sourceFromClose = true; }
      }
      const { touches, daysToFund } = await leadTouches(leadId, m.fundedDate);
      m.touches = touches;
      m.daysToFund = daysToFund;
    } catch (e) {
      note(`Close activities failed for ${m.dba}: ${e.message}`);
    }
  }
  assignCredit(merchants, families); // re-run: Close may have changed sources

  // --- Steps 5 + 6 --------------------------------------------------------
  const canvas = buildCanvas(runDate, families, merchants);
  const post = buildPost(families, merchants);

  if (dryRun) {
    console.log('\n===== CANVAS =====\n' + canvas);
    console.log('\n===== POST =====\n' + post);
    if (problems.length) console.log('\n===== WOULD DM COLLEEN =====\n' + problems.join('\n'));
    return;
  }

  // File mode: something else does the posting (e.g. a Claude routine with the
  // Slack connector). No Slack token needed anywhere in this process.
  const outDir = process.env.OUTPUT_DIR;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.md'), canvas);
    fs.writeFileSync(path.join(outDir, 'post.txt'), post);
    fs.writeFileSync(path.join(outDir, 'problems.txt'), problems.join('\n'));
    fs.writeFileSync(
      path.join(outDir, 'meta.json'),
      JSON.stringify({
        runDate,
        canvasTitle: `Getty Weekly Funnel — ${runDate}`,
        channel: cfg.SLACK.CHANNEL_NAME,
        colleenId: cfg.SLACK.COLLEEN_ID,
        merchants: merchants.length,
        funded: merchants.filter((m) => m.funded).length,
        problems: problems.length,
      }, null, 2)
    );
    console.log(`[output] wrote report.md, post.txt, problems.txt, meta.json -> ${outDir}`);
    return;
  }

  const channelId = await slack.findChannelId(cfg.SLACK.CHANNEL_NAME);
  await slack.createCanvas(`Getty Weekly Funnel — ${runDate}`, canvas);
  await slack.postMessage(channelId, post);

  if (problems.length) {
    await slack.dmColleen(`Weekly funnel ${runDate} — issues:\n• ${problems.join('\n• ')}`);
  }
}

main().catch(async (err) => {
  console.error(err);
  if (!process.env.OUTPUT_DIR && process.env.SLACK_BOT_TOKEN) {
    await slack.dmColleen(`Weekly funnel FAILED: ${err.message}`);
  }
  process.exit(1);
});
