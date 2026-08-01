#!/usr/bin/env node
// Fetches all VTuber channels from Holodex and writes vtubers.json to repo root.
// Requires HOLODEX_API_KEY env var. Run via GitHub Actions (see .github/workflows/update-vtubers.yml).

const fs = require("fs");

const KEY   = process.env.HOLODEX_API_KEY;
const LIMIT = 50;
const OUT   = "vtubers.json";

if (!KEY) { console.error("HOLODEX_API_KEY not set"); process.exit(1); }

async function fetchPage(offset) {
  const url = `https://holodex.net/api/v2/channels?type=vtuber&limit=${LIMIT}&offset=${offset}&sort=subscriber_count&order=desc`;
  const res = await fetch(url, { headers: { "X-APIKEY": KEY } });
  if (!res.ok) throw new Error(`Holodex ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const results = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    for (const ch of page) {
      if (!ch.photo) continue;
      results.push({
        name:  ch.english_name || ch.name,
        alt:   ch.english_name ? ch.name : null,
        photo: ch.photo,
        id:    ch.id,
      });
    }
    console.log(`  offset ${offset}: got ${page.length} (total so far: ${results.length})`);
    if (page.length < LIMIT) break;
    offset += LIMIT;
    await new Promise(r => setTimeout(r, 250)); // be polite to the API
  }

  // Sort alphabetically so binary search is possible in the future
  results.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(OUT, JSON.stringify(results));
  console.log(`Wrote ${results.length} entries to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
