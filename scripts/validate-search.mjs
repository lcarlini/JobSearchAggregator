#!/usr/bin/env node
/**
 * Full search-engine simulation: live APIs + static caches + filter funnel + deeplinks.
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
import { normalizeArbeitnow } from "../assets/js/sources/arbeitnow.js";
import { normalizeJobicy } from "../assets/js/sources/jobicy.js";
import { normalizeHimalayas } from "../assets/js/sources/himalayas.js";
import { normalizeTheMuse } from "../assets/js/sources/themuse.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function tryFetch(name, fn) {
  const t0 = Date.now();
  try {
    const jobs = await fn();
    console.log(`  ✓ ${name}: ${jobs.length} (${Date.now() - t0}ms)`);
    return { name, jobs, ok: true };
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    return { name, jobs: [], ok: false, error: e.message };
  }
}

function bySource(jobs) {
  const m = {};
  for (const j of jobs) m[j.source] = (m[j.source] || 0) + 1;
  return m;
}

function funnel(jobs, filters) {
  const steps = [
    ["start", {}],
    ["keywords", { keywords: filters.keywords }],
    ["recency", { keywords: filters.keywords, recency: filters.recency }],
    ["workplace", { keywords: filters.keywords, recency: filters.recency, workplace: filters.workplace }],
    ["geo", { keywords: filters.keywords, recency: filters.recency, workplace: filters.workplace, geo: filters.geo }],
    ["full", filters],
  ];
  const out = [];
  for (const [label, f] of steps) {
    out.push([label, applyFilters(jobs, { ...defaultFilters(), keywords: "", recency: "any", workplace: "any", geo: "any", applyHacks: false, ...f }).length]);
  }
  return out;
}

console.log("=== Static caches ===");
const ats = normalizeStaticAts(loadJson("data/ats-jobs.json") || { jobs: [] });
const apinfo = normalizeApinfo(loadJson("data/apinfo-jobs.json") || { jobs: [] });
const himaStatic = normalizeHimalayas(loadJson("data/himalayas-jobs.json") || { jobs: [] });
const museStatic = normalizeTheMuse(loadJson("data/themuse-jobs.json") || { jobs: [] });
console.log(`ATS ${ats.length} | ApInfo ${apinfo.length} | Himalayas JSON ${himaStatic.length} | Muse JSON ${museStatic.length}`);

console.log("\n=== Live APIs (Node / no CORS) ===");
const liveReports = [];
liveReports.push(
  await tryFetch("RemoteOK", async () =>
    normalizeRemoteOk(
      await fetch("https://remoteok.com/api", {
        headers: { "User-Agent": "JobSearchAggregator" },
      }).then((r) => r.json())
    )
  )
);
liveReports.push(
  await tryFetch("Remotive", async () =>
    normalizeRemotive(
      await fetch("https://remotive.com/api/remote-jobs?limit=100").then((r) => r.json())
    )
  )
);
liveReports.push(
  await tryFetch("Arbeitnow", async () =>
    normalizeArbeitnow(
      await fetch("https://www.arbeitnow.com/api/job-board-api").then((r) => r.json())
    )
  )
);
liveReports.push(
  await tryFetch("Jobicy", async () =>
    normalizeJobicy(
      await fetch("https://jobicy.com/api/v2/remote-jobs?count=50").then((r) => r.json())
    )
  )
);
liveReports.push(
  await tryFetch("Himalayas live", async () =>
    normalizeHimalayas(
      await fetch("https://himalayas.app/jobs/api?limit=100").then((r) => r.json())
    )
  )
);
liveReports.push(
  await tryFetch("The Muse live", async () =>
    normalizeTheMuse(
      await fetch(
        "https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=0"
      ).then((r) => r.json())
    )
  )
);

const liveJobs = liveReports.flatMap((r) => r.jobs);
const pool = dedupeJobs([
  ...ats,
  ...apinfo,
  ...himaStatic,
  ...museStatic,
  ...liveJobs,
]);
console.log(`\nPool after dedupe: ${pool.length}`);
console.log("by source:", bySource(pool));

const scenarios = [
  { name: "UI default LATAM", filters: { ...defaultFilters(), applyHacks: true } },
  { name: "LATAM + .NET", filters: { ...marketPreset("latam"), keywords: ".NET", applyHacks: true } },
  { name: "Brasil + .NET", filters: { ...marketPreset("brazil"), keywords: ".NET", applyHacks: true } },
  { name: "Europe soft", filters: { ...marketPreset("europe"), keywords: ".NET, Java", applyHacks: true } },
  { name: "US soft", filters: { ...marketPreset("us"), keywords: ".NET", applyHacks: true } },
  { name: "Worldwide no keywords", filters: { ...marketPreset("worldwide"), keywords: "", applyHacks: true } },
  {
    name: "Broken old UI",
    filters: {
      ...defaultFilters(),
      keywords: ".NET, C#",
      brazilOk: true,
      recency: "3d",
      seniority: "senior+",
      applyHacks: false,
    },
  },
];

console.log("\n=== Scenarios ===");
for (const s of scenarios) {
  const hacked = applySearchHacks(s.filters);
  const out = applyFilters(pool, hacked.filters);
  console.log(`\n${s.name} → ${out.length}`);
  console.log("  sources:", bySource(out));
  console.log("  external boards:", hacked.external.map((e) => e.name).slice(0, 6).join(", "));
  if (s.name.includes("LATAM + .NET")) {
    console.log("  funnel:", funnel(pool, hacked.filters).map(([k, v]) => `${k}=${v}`).join(" → "));
  }
}

const li = buildDeepLinks({ keywords: ".NET", workplace: "remote", recency: "24h", geo: "latam" }).find(
  (l) => l.id === "linkedin"
);
console.log("\n=== LinkedIn deeplink ===");
console.log(li?.url);

const liveOk = liveReports.filter((r) => r.ok).length;
console.log(`\n=== Coverage summary ===`);
console.log(`Live APIs OK: ${liveOk}/${liveReports.length}`);
console.log(`Static fallbacks: Himalayas=${himaStatic.length}, Muse=${museStatic.length}`);
console.log(`LinkedIn/Indeed: deeplink-only (expected)`);
if (himaStatic.length === 0) console.log("WARN: run npm run fetch-live to populate Himalayas/Muse caches");
