/**
 * STEP 6 — deliver.
 * One canvas, one channel post. DMs go to Colleen ONLY on failure.
 */

const cfg = require('./config');

async function slack(method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error}`);
  return json;
}

async function findChannelId(name) {
  let cursor;
  for (;;) {
    const url = new URL('https://slack.com/api/conversations.list');
    url.searchParams.set('limit', '200');
    url.searchParams.set('types', 'public_channel,private_channel');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`Slack conversations.list failed: ${json.error}`);

    const hit = (json.channels || []).find((c) => c.name === name);
    if (hit) return hit.id;

    cursor = json.response_metadata && json.response_metadata.next_cursor;
    if (!cursor) throw new Error(`Channel #${name} not found`);
  }
}

async function createCanvas(title, markdown) {
  const r = await slack('canvases.create', {
    title,
    document_content: { type: 'markdown', markdown },
  });
  return r.canvas_id;
}

async function postMessage(channel, text) {
  return slack('chat.postMessage', { channel, text, unfurl_links: false });
}

/** Errors never touch the canvas or the channel — Colleen gets a DM. */
async function dmColleen(text) {
  try {
    const im = await slack('conversations.open', { users: cfg.SLACK.COLLEEN_ID });
    await postMessage(im.channel.id, text);
  } catch (e) {
    console.error('[slack] could not DM Colleen:', e.message);
  }
}

module.exports = { findChannelId, createCanvas, postMessage, dmColleen };
