#!/usr/bin/env node
/**
 * Manual validation: fetch live APIs + static caches, apply the same filters
 * the UI uses, and print counts + LinkedIn/ApInfo deep-links.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyFilters, marketPreset, defaultFilters } from "../assets/js/filters.js";
import { applySearchHacks } from "../assets/js/apply-hacks.js";
import { dedupeJobs } from "../assets/js/normalize.js";
import { buildDeepLinks } from "../assets/js/sources/deeplinks.js";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { normalizeApinfo } from "../assets/js/sources/apinfo.js";
import { normalizeRemoteOk } from "../assets/js/sources/remoteok.js";
import { normalizeRemotive } from "../assets/js/sources/remotive.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function tryFetch(name, fn) {
  const t0 = Date.now();
  try {
    const jobs = await fn();
    console.log(`  ✓ ${name}: ${jobs.length} (${Date.now() - t0}ms)`);
    return jobs;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    return [];
  }
}

const ats = normalizeStaticAts(
  JSON.parse(fs.readFileSync(path.join(root, "data/ats-jobs.json"), "utf8"))
);
console.log(`static ATS: ${ats.length}`);

let apinfo = [];
try {
  apinfo = normalizeApinfo(
    JSON.parse(fs.readFileSync(path.join(root, "data/apinfo-jobs.json"), "utf8"))
  );
  console.log(`ApInfo cache: ${apinfo.length}`);
} catch {
  console.log("ApInfo cache: missing");
}

console.log("\nLive APIs…");
const live = [];
live.push(
  ...(await tryFetch("RemoteOK", async () => {
    const r = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobSearchAggregator" },
    });
    const data = await r.json();
    return normalizeRemoteOk(data);
  }))
);
live.push(
  ...(await tryFetch("Remotive", async () => {
    const r = await fetch("https://remotive.com/api/remote-jobs?limit=100");
    const data = await r.json();
    return normalizeRemotive(data);
  }))
);

const all = dedupeJobs([...ats, ...apinfo, ...live]);
console.log(`\nPool after dedupe: ${all.length}`);

const scenarios = [
  {
    name: "UI default LATAM (soft)",
    filters: { ...defaultFilters(), keywords: ".NET, C#", applyHacks: true },
  },
  {
    name: "OLD broken (brazilOk + 3d + senior+)",
    filters: {
      ...defaultFilters(),
      keywords: ".NET, C#",
      geo: "latam",
      workplace: "remote",
      brazilOk: true,
      recency: "3d",
      seniority: "senior+",
      applyHacks: false,
    },
  },
  {
    name: "LATAM market preset + .NET",
    filters: { ...marketPreset("latam"), keywords: ".NET", applyHacks: true },
  },
  {
    name: "Brasil + .NET",
    filters: { ...marketPreset("brazil"), keywords: ".NET", applyHacks: true },
  },
  {
    name: "Worldwide .NET",
    filters: { ...marketPreset("worldwide"), keywords: ".NET", applyHacks: true },
  },
];

for (const s of scenarios) {
  const hacked = applySearchHacks(s.filters);
  const out = applyFilters(all, hacked.filters);
  const bySource = {};
  for (const j of out) bySource[j.source] = (bySource[j.source] || 0) + 1;
  console.log(`\n=== ${s.name} → ${out.length} jobs ===`);
  console.log("  by source:", bySource);
  console.log(
    "  sample:",
    out.slice(0, 5).map((j) => `${j.source}: ${j.title}`.slice(0, 80))
  );
}

const liFilters = {
  keywords: ".NET",
  geo: "latam",
  workplace: "remote",
  recency: "24h",
  applyHacks: true,
};
const links = buildDeepLinks(liFilters);
const li = links.find((l) => l.id === "linkedin");
const ap = links.find((l) => l.id === "apinfo");
console.log("\n=== Deep-links (manual open) ===");
console.log("LinkedIn:", li?.url);
console.log("ApInfo:", ap?.url);
console.log(
  "\nCompare with user LinkedIn (24h .NET):\nhttps://www.linkedin.com/jobs/search/?keywords=.NET&f_TPR=r86400&f_WT=2"
);
