#!/usr/bin/env node
/**
 * Probe curated LinkedIn/brand → ATS aliases and merge hits into companies.json.
 * Only keeps boards that return ≥1 job (SmartRecruiters false-positive guard).
 *
 * Usage: node scripts/apply-ats-aliases.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWorkdayBoard } from "./lib/workday.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)";

const aliasesPath = path.join(root, "data", "ats-aliases.json");
const companiesPath = path.join(root, "data", "companies.json");

const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
const companies = JSON.parse(fs.readFileSync(companiesPath, "utf8"));

async function probe(ats, slug) {
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=false`,
    lever: `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
    smartrecruiters: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=10&offset=0`,
    personio: `https://${encodeURIComponent(slug)}.jobs.personio.com/xml`,
  };
  const url = urls[ats];
  if (!url) return 0;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json, application/xml", "User-Agent": UA } });
    if (!res.ok) return 0;
    if (ats === "personio") {
      const text = await res.text();
      return (text.match(/<position[\s>]/gi) || []).length;
    }
    const data = await res.json();
    if (ats === "lever") return Array.isArray(data) ? data.length : 0;
    if (ats === "smartrecruiters") return (data.content || []).length;
    if (ats === "workable") return (data.jobs || []).length;
    return (data.jobs || []).length;
  } catch {
    return 0;
  }
}

async function probeWorkday(board) {
  const b = normalizeWorkdayBoard(board);
  if (!b) return 0;
  try {
    const res = await fetch(`https://${b.host}/wday/cxs/${b.tenant}/${b.site}/jobs`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": UA,
        Referer: `https://${b.host}/${b.site}`,
      },
      body: JSON.stringify({ appliedFacets: {}, limit: 5, offset: 0, searchText: "" }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data.total) || (data.jobPostings || []).length || 0;
  } catch {
    return 0;
  }
}

const added = { greenhouse: [], lever: [], ashby: [], workable: [], smartrecruiters: [], personio: [], workday: [] };
const entries = Object.entries(aliasesDoc.aliases || {});
let i = 0;

for (const [name, map] of entries) {
  i++;
  for (const [ats, slugOrBoard] of Object.entries(map)) {
    if (ats === "workday") {
      const b = normalizeWorkdayBoard(slugOrBoard);
      if (!b) continue;
      if ((companies.workday || []).some((x) => (x.id || x) === b.id)) continue;
      const n = await probeWorkday(b);
      console.log(`[${i}/${entries.length}] ${name} → workday/${b.id}: ${n}`);
      if (n > 0) {
        companies.workday = [...(companies.workday || []), b];
        added.workday.push(b.id);
      }
      continue;
    }
    const slug = String(slugOrBoard);
    const list = companies[ats] || [];
    if (list.some((s) => String(s).toLowerCase() === slug.toLowerCase())) {
      console.log(`[${i}/${entries.length}] ${name} → ${ats}/${slug}: already listed`);
      continue;
    }
    const n = await probe(ats, slug);
    console.log(`[${i}/${entries.length}] ${name} → ${ats}/${slug}: ${n}`);
    if (n > 0) {
      companies[ats] = [...list, slug];
      added[ats].push(slug);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
}

for (const k of Object.keys(added)) {
  if (k === "workday") continue;
  companies[k] = [...new Set((companies[k] || []).map(String))].sort((a, b) =>
    a.localeCompare(b)
  );
}
const wdMap = new Map();
for (const raw of companies.workday || []) {
  const b = normalizeWorkdayBoard(raw);
  if (b) wdMap.set(b.id, b);
}
companies.workday = [...wdMap.values()].sort((a, b) => a.id.localeCompare(b.id));
companies.generatedAt = new Date().toISOString();
if (!String(companies.source || "").includes("ats-aliases")) {
  companies.source = `${companies.source || "companies"} + ats-aliases`;
}

fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2) + "\n");
console.log("Added:", Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])));
console.log(
  "Totals:",
  Object.fromEntries(
    ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "personio", "workday"].map((k) => [
      k,
      (companies[k] || []).length,
    ])
  )
);
