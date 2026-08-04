#!/usr/bin/env node
/**
 * Discover ATS / Workday boards from:
 *  - data/linkedin-companies-seed.json (employers)
 *  - data/empresas.json + data/sources.json bookmark URLs
 *
 * Validates existing career URLs (HEAD/GET) → data/link-health.json
 * Probes slugify(name) against Greenhouse/Lever/Ashby/Workable
 * Parses Workday only from known URLs (never guess wdN/site)
 * Optionally fetches homepage/careers HTML for ATS link extraction
 *
 * Usage:
 *   node scripts/discover-company-ats.mjs
 *   node scripts/discover-company-ats.mjs --fast   # skip HTML crawl, limit probes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyCompany } from "./lib/company-classify.mjs";
import { parseAtsUrl, extractAtsLinksFromHtml } from "./lib/ats-url-parse.mjs";
import { parseWorkdayUrl, normalizeWorkdayBoard } from "./lib/workday.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fast = process.argv.includes("--fast");
const UA = "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)";

const outDiscover = path.join(root, "data", "discovered-ats.json");
const outHealth = path.join(root, "data", "link-health.json");

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

async function checkUrl(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA },
    });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      });
    }
    return {
      url,
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      state: res.ok ? "ok" : res.status >= 300 && res.status < 400 ? "redirect" : "fail",
    };
  } catch (e) {
    return { url, ok: false, status: 0, state: "fail", error: e.message };
  } finally {
    clearTimeout(t);
  }
}

async function probeSlug(slug) {
  const probes = [
    {
      ats: "greenhouse",
      url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=false`,
      pick: (d) => (d.jobs || []).length,
    },
    {
      ats: "lever",
      url: `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
      pick: (d) => (Array.isArray(d) ? d.length : 0),
    },
    {
      ats: "ashby",
      url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
      pick: (d) => (d.jobs || []).length,
    },
    {
      ats: "workable",
      url: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
      pick: (d) => (d.jobs || []).length,
    },
  ];
  for (const p of probes) {
    try {
      const res = await fetch(p.url, {
        headers: { Accept: "application/json", "User-Agent": UA },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const n = p.pick(data);
      if (n > 0) return { ats: p.ats, slug, jobs: n };
    } catch {
      /* next */
    }
  }
  return null;
}

async function mapPool(items, concurrency, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

const empresas = loadJson(path.join(root, "data", "empresas.json"), { companies: [] });
const sources = loadJson(path.join(root, "data", "sources.json"), { bookmarkBoards: [] });
const seed = loadJson(path.join(root, "data", "linkedin-companies-seed.json"), { companies: [] });
const companiesFile = loadJson(path.join(root, "data", "companies.json"), {});

const discovered = {
  generatedAt: new Date().toISOString(),
  greenhouse: [],
  lever: [],
  ashby: [],
  workable: [],
  smartrecruiters: [],
  recruitee: [],
  breezy: [],
  bamboohr: [],
  personio: [],
  workday: [],
  employers: [],
  boards: [],
  notes: [],
};

function addSlug(ats, slug, meta = {}) {
  if (!slug || !discovered[ats]) return;
  if (!discovered[ats].includes(slug)) discovered[ats].push(slug);
  discovered.notes.push({ ats, slug, ...meta });
}

function addWorkday(board, meta = {}) {
  const b = normalizeWorkdayBoard(board);
  if (!b) return;
  if (!discovered.workday.some((x) => x.id === b.id)) discovered.workday.push(b);
  discovered.notes.push({ ats: "workday", id: b.id, ...meta });
}

function ingestParsed(parsed, meta) {
  if (!parsed) return;
  if (parsed.ats === "workday") addWorkday(parsed.board, meta);
  else addSlug(parsed.ats, parsed.slug, meta);
}

// 1) Parse URLs already in empresas + bookmarkBoards
const urlsToCheck = [];
for (const c of empresas.companies || []) {
  if (c.url) {
    urlsToCheck.push({ url: c.url, name: c.name, source: "empresas" });
    ingestParsed(parseAtsUrl(c.url), { from: "empresas", name: c.name });
  }
}
for (const b of sources.bookmarkBoards || []) {
  if (b.url) {
    urlsToCheck.push({ url: b.url, name: b.name, source: "sources" });
    ingestParsed(parseAtsUrl(b.url), { from: "sources", name: b.name });
  }
}

// Seed Workday from known CSG example always
addWorkday(
  {
    id: "csgi/CSGCareers",
    host: "csgi.wd5.myworkdayjobs.com",
    tenant: "csgi",
    site: "CSGCareers",
  },
  { from: "seed", name: "CSG" }
);

console.log(`Validating ${urlsToCheck.length} catalog URLs…`);
const healthRows = await mapPool(urlsToCheck, fast ? 8 : 12, async (row) => {
  const h = await checkUrl(row.url);
  return { ...row, ...h };
});
const linkHealth = {
  generatedAt: new Date().toISOString(),
  total: healthRows.length,
  ok: healthRows.filter((r) => r.ok).length,
  fail: healthRows.filter((r) => !r.ok).length,
  links: healthRows,
};
fs.writeFileSync(outHealth, JSON.stringify(linkHealth, null, 2));
console.log(`Link health: ${linkHealth.ok} ok / ${linkHealth.fail} fail → ${outHealth}`);

// 2) Employer seed → probe slugs + optional careers HTML
const employers = (seed.companies || []).filter((c) => c.kind === "employer");
const boards = (seed.companies || []).filter((c) => c.kind === "board" || c.kind === "agency");

for (const b of boards) {
  discovered.boards.push({ name: b.name, kind: b.kind, slug: b.slug });
}

const existing = new Set([
  ...(companiesFile.greenhouse || []),
  ...(companiesFile.lever || []),
  ...(companiesFile.ashby || []),
  ...(companiesFile.workable || []),
].map((s) => String(s).toLowerCase()));

const probeLimit = fast ? 80 : 180;
const toProbe = employers
  .map((e) => ({ ...e, slug: e.slug || slugifyCompany(e.name) }))
  .filter((e) => e.slug && e.slug.length >= 3 && !existing.has(e.slug.toLowerCase()))
  .slice(0, probeLimit);

console.log(`Probing ${toProbe.length} employer slugs (limit ${probeLimit})…`);
let hits = 0;
await mapPool(toProbe, fast ? 4 : 6, async (emp) => {
  const hit = await probeSlug(emp.slug);
  if (hit) {
    hits++;
    addSlug(hit.ats, hit.slug, { from: "probe", name: emp.name, jobs: hit.jobs });
    discovered.employers.push({
      name: emp.name,
      slug: hit.slug,
      ats: hit.ats,
      jobs: hit.jobs,
      source: "probe",
    });
  }
  // Light HTML crawl for high-value names when not found
  if (!hit && !fast && /^(csg|ifood|ebanx|grafana|gitlab|atlassian|hotmart|stone|neon|pismo|belvo|talkdesk|zenvia|nubank)$/i.test(emp.slug)) {
    const candidates = [
      `https://www.${emp.slug}.com/careers`,
      `https://careers.${emp.slug}.com/`,
      `https://www.${emp.slug}.com/jobs`,
      `https://${emp.slug}.com/careers`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA, Accept: "text/html" },
          redirect: "follow",
        });
        if (!res.ok) continue;
        const html = await res.text();
        const links = extractAtsLinksFromHtml(html, res.url);
        for (const link of links) {
          ingestParsed(link, { from: "html", name: emp.name, page: res.url });
          discovered.employers.push({
            name: emp.name,
            ats: link.ats,
            slug: link.slug || link.board?.id,
            url: link.url,
            source: "html",
          });
        }
        if (links.length) break;
      } catch {
        /* next */
      }
    }
  }
});

console.log(`Probe hits: ${hits}`);

// Deduplicate slug arrays
for (const key of [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "breezy",
  "bamboohr",
  "personio",
]) {
  discovered[key] = [...new Set(discovered[key])].sort((a, b) => a.localeCompare(b));
}
const wdSeen = new Set();
discovered.workday = discovered.workday.filter((b) => {
  if (wdSeen.has(b.id)) return false;
  wdSeen.add(b.id);
  return true;
});

discovered.stats = {
  greenhouse: discovered.greenhouse.length,
  lever: discovered.lever.length,
  ashby: discovered.ashby.length,
  workable: discovered.workable.length,
  workday: discovered.workday.length,
  employersFound: discovered.employers.length,
  boardsListed: discovered.boards.length,
  linkOk: linkHealth.ok,
  linkFail: linkHealth.fail,
};

fs.writeFileSync(outDiscover, JSON.stringify(discovered, null, 2) + "\n");
console.log("Wrote", outDiscover, discovered.stats);
