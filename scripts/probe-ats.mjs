#!/usr/bin/env node
/**
 * Probe which public ATS a company slug hits (Babak-hasani/company-career-scraper pattern).
 * Order: Greenhouse → Lever (+EU) → Ashby → SmartRecruiters → Workable → Recruitee → BambooHR → Personio → Breezy
 *
 * Usage:
 *   node scripts/probe-ats.mjs stripe openai remote nubank
 *   node scripts/probe-ats.mjs --file candidates.txt
 */
import fs from "node:fs";

const UA = "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)";

async function tryGet(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json, application/xml, */*", "User-Agent": UA },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function countJobs(ats, payload) {
  try {
    if (ats === "personio") {
      return (payload.match(/<position[\s>]/gi) || []).length;
    }
    const data = JSON.parse(payload);
    if (ats === "lever") return Array.isArray(data) ? data.length : 0;
    if (ats === "smartrecruiters") return (data.content || []).length || data.totalFound || 0;
    if (ats === "workable") return (data.jobs || []).length;
    if (ats === "bamboohr") return (data.result || data.jobs || []).length;
    if (ats === "breezy") return (Array.isArray(data) ? data : data.positions || []).length;
    return (data.jobs || []).length;
  } catch {
    return 0;
  }
}

const PROBES = [
  {
    ats: "greenhouse",
    url: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs?content=false`,
  },
  {
    ats: "lever",
    url: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`,
  },
  {
    ats: "lever-eu",
    url: (s) => `https://api.eu.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`,
  },
  {
    ats: "ashby",
    url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
  },
  {
    ats: "smartrecruiters",
    url: (s) =>
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s)}/postings?limit=10&offset=0`,
  },
  {
    ats: "workable",
    url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(s)}`,
  },
  {
    ats: "recruitee",
    url: (s) => `https://${encodeURIComponent(s)}.recruitee.com/api/offers/`,
  },
  {
    ats: "bamboohr",
    url: (s) => `https://${encodeURIComponent(s)}.bamboohr.com/careers/list`,
  },
  {
    ats: "personio",
    url: (s) => `https://${encodeURIComponent(s)}.jobs.personio.com/xml`,
  },
  {
    ats: "breezy",
    url: (s) => `https://${encodeURIComponent(s)}.breezy.hr/json`,
  },
];

async function probeSlug(slug) {
  const hits = [];
  for (const p of PROBES) {
    try {
      const { ok, status, text } = await tryGet(p.url(slug));
      if (!ok) continue;
      const n = countJobs(p.ats.replace("-eu", ""), text);
      // SmartRecruiters false positive: 200 + 0 jobs for any name
      if (p.ats === "smartrecruiters" && n < 1) continue;
      if (n < 1 && p.ats !== "bamboohr") continue;
      hits.push({ ats: p.ats, jobs: n, status });
      // First strong hit is enough for routing (GH→Lever→Ashby order)
      if (n >= 1 && ["greenhouse", "lever", "lever-eu", "ashby"].includes(p.ats)) break;
    } catch {
      /* next */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return hits;
}

const args = process.argv.slice(2);
let slugs = args.filter((a) => !a.startsWith("--"));
const fileIdx = args.indexOf("--file");
if (fileIdx >= 0 && args[fileIdx + 1]) {
  slugs = fs
    .readFileSync(args[fileIdx + 1], "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
if (!slugs.length) {
  console.log("Usage: node scripts/probe-ats.mjs <slug> [slug…]");
  process.exit(1);
}

for (const slug of slugs) {
  const hits = await probeSlug(slug);
  if (!hits.length) console.log(`${slug}: no public ATS hit`);
  else console.log(`${slug}: ${hits.map((h) => `${h.ats}(${h.jobs})`).join(", ")}`);
}
