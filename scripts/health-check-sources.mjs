#!/usr/bin/env node
/**
 * Probe all known sources: live APIs, ATS samples, RSS, static caches, deeplink homes.
 *
 * Usage:
 *   node scripts/health-check-sources.mjs
 *   node scripts/health-check-sources.mjs --deeplinks   # also HEAD every built deeplink URL
 *   node scripts/health-check-sources.mjs --json        # machine-readable summary
 *
 * Exit 1 if any *critical* source fails.
 */
import fs from "node:fs";
import path from "node:path";
import {
  LIVE_APIS,
  ATS_SAMPLES,
  RSS_FEEDS,
  STATIC_CACHES,
  DEEPLINK_HOMES,
  builtDeeplinkUrls,
  ROOT,
} from "./lib/source-catalog.mjs";
import {
  checkJsonSource,
  checkRssSource,
  checkReachable,
  checkStaticCache,
  mapPool,
  summarize,
} from "./lib/health-check.mjs";
import { normalizeRemoteOk } from "../assets/js/sources/remoteok.js";
import { normalizeRemotive } from "../assets/js/sources/remotive.js";
import { normalizeArbeitnow } from "../assets/js/sources/arbeitnow.js";
import { normalizeJobicy } from "../assets/js/sources/jobicy.js";
import { normalizeHimalayas } from "../assets/js/sources/himalayas.js";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { normalizeApinfo } from "../assets/js/sources/apinfo.js";
import { normalizeWeWorkRemotely } from "../assets/js/sources/weworkremotely.js";
import { jobShapeOk } from "./lib/source-catalog.mjs";

const args = new Set(process.argv.slice(2));
const wantDeeplinks = args.has("--deeplinks");
const asJson = args.has("--json");

const results = [];

console.log("── Static caches ──");
for (const src of STATIC_CACHES) {
  const r = checkStaticCache(src);
  results.push(r);
  console.log(fmt(r));
}

console.log("\n── Live JSON APIs ──");
for (const src of LIVE_APIS) {
  const r = await checkJsonSource(src);
  results.push(r);
  console.log(fmt(r));
}

console.log("\n── ATS sample boards ──");
for (const src of ATS_SAMPLES) {
  const r = await checkJsonSource(src);
  results.push(r);
  console.log(fmt(r));
}

console.log("\n── RSS feeds ──");
for (const src of RSS_FEEDS) {
  const r = await checkRssSource(src);
  results.push(r);
  console.log(fmt(r));
}

console.log("\n── Deeplink homes ──");
const homes = await mapPool(DEEPLINK_HOMES, 8, (src) => checkReachable(src));
for (const r of homes) {
  results.push(r);
  console.log(fmt(r));
}

if (wantDeeplinks) {
  console.log("\n── Built deeplink URLs (Brazil .NET remote) ──");
  const links = builtDeeplinkUrls();
  // Unique hosts to avoid hammering
  const byHost = new Map();
  for (const l of links) {
    try {
      const host = new URL(l.url).host;
      if (!byHost.has(host)) byHost.set(host, l);
    } catch {
      results.push({
        id: l.id,
        critical: !!l.critical,
        kind: "http",
        ok: false,
        status: 0,
        ms: 0,
        error: "invalid URL",
        count: 0,
      });
    }
  }
  const hostChecks = await mapPool([...byHost.values()], 10, (src) =>
    checkReachable({ id: src.id, url: src.url, critical: src.critical })
  );
  for (const r of hostChecks) {
    results.push(r);
    console.log(fmt(r));
  }
  console.log(`(checked ${hostChecks.length} unique hosts from ${links.length} deeplinks)`);
}

console.log("\n── Normalize sample payloads (shape) ──");
const shapeResults = await validateLiveNormalize();
for (const r of shapeResults) {
  results.push(r);
  console.log(fmt(r));
}

const summary = summarize(results);
const report = {
  generatedAt: new Date().toISOString(),
  summary,
  results,
};
const outPath = path.join(ROOT, "data", "source-health.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("\n══ Summary ══");
  console.log(
    `ok ${summary.ok}/${summary.total} · critical fails ${summary.criticalFailed} · soft fails ${summary.softFailed}`
  );
  if (summary.criticalFailIds.length) {
    console.log("CRITICAL:", summary.criticalFailIds.join(", "));
  }
  if (summary.softFailIds.length) {
    console.log("soft:", summary.softFailIds.join(", "));
  }
  console.log(`Wrote data/source-health.json`);
}

process.exit(summary.criticalFailed ? 1 : 0);

function fmt(r) {
  const flag = r.ok ? "OK " : r.critical ? "FAIL*" : "warn";
  const extra = r.count != null ? ` n=${r.count}` : "";
  const err = r.error ? ` — ${r.error}` : "";
  return `  [${flag}] ${r.id} (${r.kind || "?"}) ${r.status || "-"} ${r.ms || 0}ms${extra}${err}`;
}

async function validateLiveNormalize() {
  const out = [];
  const checks = [
    {
      id: "shape:remoteok",
      critical: true,
      url: "https://remoteok.com/api",
      normalize: (d) => normalizeRemoteOk(d),
    },
    {
      id: "shape:remotive",
      critical: true,
      url: "https://remotive.com/api/remote-jobs?category=software-dev",
      normalize: (d) => normalizeRemotive(d),
    },
    {
      id: "shape:arbeitnow",
      critical: true,
      url: "https://www.arbeitnow.com/api/job-board-api",
      normalize: (d) => normalizeArbeitnow(d),
    },
    {
      id: "shape:jobicy",
      critical: true,
      url: "https://jobicy.com/api/v2/remote-jobs?count=20",
      normalize: (d) => normalizeJobicy(d),
    },
    {
      id: "shape:himalayas",
      critical: true,
      url: "https://himalayas.app/jobs/api?limit=20",
      normalize: (d) => normalizeHimalayas(d),
    },
  ];

  // Static shape checks (no network)
  try {
    const ats = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ats-jobs.json"), "utf8"));
    const jobs = normalizeStaticAts(ats).slice(0, 20);
    const bad = jobs.filter((j) => !jobShapeOk(j));
    out.push({
      id: "shape:static-ats",
      critical: true,
      kind: "shape",
      ok: jobs.length >= 10 && !bad.length,
      status: 200,
      ms: 0,
      count: jobs.length,
      error: bad.length ? `${bad.length} invalid shapes` : null,
    });
  } catch (e) {
    out.push({
      id: "shape:static-ats",
      critical: true,
      kind: "shape",
      ok: false,
      status: 0,
      ms: 0,
      count: 0,
      error: e.message,
    });
  }
  try {
    const ap = JSON.parse(fs.readFileSync(path.join(ROOT, "data/apinfo-jobs.json"), "utf8"));
    const jobs = normalizeApinfo(ap).slice(0, 20);
    const bad = jobs.filter((j) => !jobShapeOk(j));
    out.push({
      id: "shape:apinfo",
      critical: true,
      kind: "shape",
      ok: jobs.length >= 5 && !bad.length,
      status: 200,
      ms: 0,
      count: jobs.length,
      error: bad.length ? `${bad.length} invalid shapes` : null,
    });
  } catch (e) {
    out.push({
      id: "shape:apinfo",
      critical: true,
      kind: "shape",
      ok: false,
      status: 0,
      ms: 0,
      count: 0,
      error: e.message,
    });
  }
  try {
    const wwr = JSON.parse(
      fs.readFileSync(path.join(ROOT, "data/weworkremotely-jobs.json"), "utf8")
    );
    const jobs = normalizeWeWorkRemotely(wwr).slice(0, 20);
    const bad = jobs.filter((j) => !jobShapeOk(j));
    out.push({
      id: "shape:wwr",
      critical: true,
      kind: "shape",
      ok: jobs.length >= 5 && !bad.length,
      status: 200,
      ms: 0,
      count: jobs.length,
      error: bad.length ? `${bad.length} invalid shapes` : null,
    });
  } catch (e) {
    out.push({
      id: "shape:wwr",
      critical: true,
      kind: "shape",
      ok: false,
      status: 0,
      ms: 0,
      count: 0,
      error: e.message,
    });
  }

  for (const c of checks) {
    const started = Date.now();
    try {
      const res = await fetch(c.url, {
        headers: { Accept: "application/json", "User-Agent": UA() },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const jobs = c.normalize(data);
      const sample = jobs.slice(0, 15);
      const bad = sample.filter((j) => !jobShapeOk(j));
      out.push({
        id: c.id,
        critical: !!c.critical,
        kind: "shape",
        ok: sample.length >= 3 && !bad.length,
        status: res.status,
        ms: Date.now() - started,
        count: jobs.length,
        error: bad.length
          ? `${bad.length} invalid job shapes`
          : sample.length < 3
            ? "too few jobs after normalize"
            : null,
      });
    } catch (e) {
      out.push({
        id: c.id,
        critical: !!c.critical,
        kind: "shape",
        ok: false,
        status: 0,
        ms: Date.now() - started,
        count: 0,
        error: e.message,
      });
    }
  }
  return out;
}

function UA() {
  return "JobSearchAggregator/1.0 health-check (+https://github.com/lcarlini/JobSearchAggregator)";
}
