#!/usr/bin/env node
/**
 * Safely merge discovered ATS boards into data/companies.json and employers into empresas.json.
 * Never clobbers existing hire-signal lists — union only.
 *
 * Usage:
 *   node scripts/merge-companies.mjs
 *   node scripts/merge-companies.mjs --from data/discovered-ats.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeWorkdayBoard } from "./lib/workday.mjs";
import { slugifyCompany } from "./lib/company-classify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromArg = process.argv.find((a) => a.startsWith("--from="));
const discoverPath = fromArg
  ? path.resolve(fromArg.slice("--from=".length))
  : path.join(root, "data", "discovered-ats.json");

const companiesPath = path.join(root, "data", "companies.json");
const empresasPath = path.join(root, "data", "empresas.json");

function load(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function uniqSort(arr) {
  return [...new Set((arr || []).filter(Boolean).map(String))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function mergeWorkday(existing, incoming) {
  const map = new Map();
  for (const raw of [...(existing || []), ...(incoming || [])]) {
    const b = normalizeWorkdayBoard(raw);
    if (!b) continue;
    map.set(b.id, b);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

if (!fs.existsSync(discoverPath)) {
  console.error("Missing discovery file:", discoverPath);
  console.error("Run: node scripts/discover-company-ats.mjs");
  process.exit(1);
}

const discovered = load(discoverPath);
const companies = load(companiesPath);
const empresas = load(empresasPath);

const slugKeys = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "breezy",
  "bamboohr",
  "personio",
];

const before = {};
for (const k of slugKeys) {
  before[k] = (companies[k] || []).length;
  companies[k] = uniqSort([...(companies[k] || []), ...(discovered[k] || [])]);
}
before.workday = (companies.workday || []).length;
companies.workday = mergeWorkday(companies.workday, discovered.workday);

// Expand latamFriendly with BR/LATAM employers from seed discoveries
const latamBoost = (discovered.employers || [])
  .map((e) => e.name)
  .filter(Boolean)
  .filter((n) =>
    /\b(brasil|brazil|latam|ubiminds|oowlish|ifood|nubank|stone|hotmart|ebanx|zenvia|ci&t|globant|revelo|neon|pismo|belvo|dock|mottu|caju|locaweb)\b/i.test(
      n
    )
  );
companies.latamFriendly = uniqSort([...(companies.latamFriendly || []), ...latamBoost]);

companies.generatedAt = new Date().toISOString();
if (!String(companies.source || "").includes("discovered-ats")) {
  companies.source = `${companies.source || "companies"} + discovered-ats merge`;
}

fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2) + "\n");

// Merge employers into empresas.json
const byKey = new Map(
  (empresas.companies || []).map((c) => [c.id || c.host || c.url, c])
);
const hostIndex = new Map(
  (empresas.companies || []).filter((c) => c.host).map((c) => [c.host, c.id || c.host])
);
let added = 0;

function upsertEmpresa(entry) {
  const key = entry.id || entry.host || entry.url;
  if (!key) return;
  // Prefer match by id, else by host for non-board company URLs
  let existingKey = byKey.has(key) ? key : null;
  if (!existingKey && entry.type !== "board" && entry.host && hostIndex.has(entry.host)) {
    existingKey = hostIndex.get(entry.host);
  }
  if (existingKey && byKey.has(existingKey)) {
    const prev = byKey.get(existingKey);
    byKey.set(existingKey, {
      ...prev,
      ...entry,
      id: prev.id,
      source: String(prev.source || "").includes("linkedin")
        ? prev.source
        : `${prev.source || "curated"}+linkedin-seed`,
    });
    return;
  }
  byKey.set(key, entry);
  if (entry.host && entry.type !== "board") hostIndex.set(entry.host, key);
  added++;
}

for (const emp of discovered.employers || []) {
  const slug = emp.slug || slugifyCompany(emp.name);
  let url = emp.url;
  if (!url && emp.ats === "greenhouse") url = `https://boards.greenhouse.io/${slug}`;
  if (!url && emp.ats === "lever") url = `https://jobs.lever.co/${slug}`;
  if (!url && emp.ats === "ashby") url = `https://jobs.ashbyhq.com/${slug}`;
  if (!url && emp.ats === "workable") url = `https://apply.workable.com/${slug}`;
  if (!url && emp.ats === "workday" && emp.id) {
    const b = (discovered.workday || []).find((w) => w.id === emp.id || w.id === emp.slug);
    url = b?.url;
  }
  if (!url) continue;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    continue;
  }
  upsertEmpresa({
    id: `co-${host.replace(/[^a-z0-9]+/g, "-")}`.slice(0, 80),
    name: emp.name,
    url,
    host,
    region: "latam",
    type: "company",
    source: "linkedin-seed",
    searchUrl: url,
    note: emp.ats ? `ATS ${emp.ats}` : undefined,
  });
}

for (const wd of discovered.workday || []) {
  upsertEmpresa({
    id: `co-wd-${wd.tenant}-${wd.site}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    name: wd.tenant,
    url: wd.url,
    host: wd.host,
    region: "worldwide",
    type: "company",
    source: "discovered-ats",
    searchUrl: wd.url,
    note: `Workday ${wd.id}`,
  });
}

for (const b of discovered.boards || []) {
  // Boards as link-type entries without inventing careers URLs
  upsertEmpresa({
    id: `board-${b.slug || slugifyCompany(b.name)}`.slice(0, 80),
    name: b.name,
    url: `https://www.google.com/search?q=${encodeURIComponent(b.name + " remote jobs")}`,
    host: "www.google.com",
    region: "worldwide",
    type: "board",
    source: "linkedin-seed",
    note: b.kind,
  });
}

empresas.companies = [...byKey.values()].sort((a, b) =>
  String(a.name).localeCompare(String(b.name))
);
empresas.generatedAt = new Date().toISOString();
empresas.stats = {
  ...(empresas.stats || {}),
  total: empresas.companies.length,
  linkedinMerged: added,
};
fs.writeFileSync(empresasPath, JSON.stringify(empresas, null, 2) + "\n");

console.log("Merged into companies.json:");
for (const k of slugKeys) {
  console.log(`  ${k}: ${before[k]} → ${companies[k].length}`);
}
console.log(`  workday: ${before.workday} → ${companies.workday.length}`);
console.log(`empresas.json: +${added} new (total ${empresas.companies.length})`);
