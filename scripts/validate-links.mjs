#!/usr/bin/env node
/**
 * Validate every catalog URL and flag working ones in-place.
 * Never removes entries — only sets linkOk / linkStatus / linkCheckedAt.
 *
 * Covers:
 *   - data/empresas.json (companies + featured; url + searchUrl)
 *   - data/sources.json (boards + bookmarkBoards)
 *   - assets/js/sources/company-careers.js pack (status → data/career-link-status.json)
 *
 * Usage: node scripts/validate-links.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_CAREER_PACK } from "../assets/js/sources/company-careers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "JobSearchAggregator/1.0 link-validate (+https://github.com/lcarlini/JobSearchAggregator)";

const empresasPath = path.join(root, "data", "empresas.json");
const sourcesPath = path.join(root, "data", "sources.json");
const healthPath = path.join(root, "data", "link-health.json");
const careersStatusPath = path.join(root, "data", "career-link-status.json");

const checkedAt = new Date().toISOString();

function load(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
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

async function checkUrl(url) {
  if (!url || typeof url !== "string") {
    return { ok: false, status: 0, state: "fail", error: "missing url" };
  }
  if (url.startsWith("./") || url.startsWith("../")) {
    const local = path.join(root, url.replace(/^\.\//, ""));
    const exists = fs.existsSync(local);
    return {
      ok: exists,
      status: exists ? 200 : 404,
      state: exists ? "ok" : "fail",
      finalUrl: url,
      error: exists ? undefined : "local file missing",
    };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, state: "fail", error: "invalid URL" };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, status: 0, state: "fail", error: `unsupported protocol ${parsed.protocol}` };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    if (res.status === 405 || res.status === 403 || res.status === 401) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      });
    }
    const ok = res.ok;
    return {
      ok,
      status: res.status,
      finalUrl: res.url || url,
      state: ok ? "ok" : res.status === 403 || res.status === 401 ? "blocked" : "fail",
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      state: "fail",
      error: e.name === "AbortError" ? "timeout" : e.message,
    };
  } finally {
    clearTimeout(t);
  }
}

function stamp(entry, result, field = "url") {
  const prefix = field === "url" ? "link" : "searchLink";
  entry[`${prefix}Ok`] = !!result.ok;
  entry[`${prefix}Status`] = result.status ?? 0;
  entry[`${prefix}State`] = result.state || (result.ok ? "ok" : "fail");
  entry[`${prefix}CheckedAt`] = checkedAt;
  if (result.finalUrl) entry[`${prefix}FinalUrl`] = result.finalUrl;
  if (result.error) entry[`${prefix}Error`] = result.error;
  else delete entry[`${prefix}Error`];
}

const empresas = load(empresasPath);
const sources = load(sourcesPath);

/** @type {{ key: string, url: string, apply: (r: any) => void, meta: object }[]} */
const jobs = [];

for (const c of empresas.featured || []) {
  if (c.url) {
    jobs.push({
      key: `featured:${c.id || c.url}`,
      url: c.url,
      meta: { name: c.name, source: "empresas-featured", id: c.id },
      apply: (r) => stamp(c, r, "url"),
    });
  }
  if (c.searchUrl && c.searchUrl !== c.url) {
    jobs.push({
      key: `featured-search:${c.id || c.searchUrl}`,
      url: c.searchUrl,
      meta: { name: c.name, source: "empresas-featured-search", id: c.id },
      apply: (r) => stamp(c, r, "searchUrl"),
    });
  }
}

for (const c of empresas.companies || []) {
  if (c.url) {
    jobs.push({
      key: `empresa:${c.id || c.url}`,
      url: c.url,
      meta: { name: c.name, source: "empresas", id: c.id },
      apply: (r) => stamp(c, r, "url"),
    });
  }
  if (c.searchUrl && c.searchUrl !== c.url) {
    jobs.push({
      key: `empresa-search:${c.id || c.searchUrl}`,
      url: c.searchUrl,
      meta: { name: `${c.name} (search)`, source: "empresas-search", id: c.id },
      apply: (r) => stamp(c, r, "searchUrl"),
    });
  }
}

for (const b of sources.boards || []) {
  if (b.url) {
    jobs.push({
      key: `board:${b.id || b.url}`,
      url: b.url,
      meta: { name: b.name, source: "sources-boards", id: b.id },
      apply: (r) => stamp(b, r, "url"),
    });
  }
}
for (const b of sources.bookmarkBoards || []) {
  if (b.url) {
    jobs.push({
      key: `bookmark:${b.id || b.url}`,
      url: b.url,
      meta: { name: b.name, source: "sources-bookmark", id: b.id },
      apply: (r) => stamp(b, r, "url"),
    });
  }
}

const careerResults = [];
for (const c of COMPANY_CAREER_PACK) {
  jobs.push({
    key: `career:${c.id}`,
    url: c.url,
    meta: { name: c.name, source: "company-careers", id: c.id },
    apply: (r) => {
      careerResults.push({
        id: c.id,
        name: c.name,
        url: c.url,
        linkOk: !!r.ok,
        linkStatus: r.status ?? 0,
        linkState: r.state || (r.ok ? "ok" : "fail"),
        linkCheckedAt: checkedAt,
        linkFinalUrl: r.finalUrl,
        linkError: r.error,
      });
    },
  });
}

// Deduplicate by URL for HTTP, but still stamp every entry
const byUrl = new Map();
for (const j of jobs) {
  const u = j.url;
  if (!byUrl.has(u)) byUrl.set(u, []);
  byUrl.get(u).push(j);
}
const uniqueUrls = [...byUrl.keys()];

console.log(`Validating ${uniqueUrls.length} unique URLs (${jobs.length} stamps)…`);

const resultsByUrl = new Map();
await mapPool(uniqueUrls, 12, async (url) => {
  const r = await checkUrl(url);
  resultsByUrl.set(url, r);
  const mark = r.ok ? "OK" : r.state === "blocked" ? "BLOCK" : "FAIL";
  console.log(`  [${mark}] ${r.status || 0} ${url.slice(0, 90)}`);
  return r;
});

const healthLinks = [];
for (const [url, group] of byUrl) {
  const r = resultsByUrl.get(url);
  for (const j of group) {
    j.apply(r);
    healthLinks.push({
      url,
      ...j.meta,
      ok: !!r.ok,
      status: r.status ?? 0,
      finalUrl: r.finalUrl || url,
      state: r.state || (r.ok ? "ok" : "fail"),
      error: r.error,
    });
  }
}

empresas.linkHealth = {
  checkedAt,
  total: (empresas.companies || []).length + (empresas.featured || []).length,
  ok: [...(empresas.featured || []), ...(empresas.companies || [])].filter((c) => c.linkOk).length,
  fail: [...(empresas.featured || []), ...(empresas.companies || [])].filter((c) => c.linkOk === false)
    .length,
};
empresas.generatedAt = empresas.generatedAt || checkedAt;

sources.linkHealth = {
  checkedAt,
  boardsOk: (sources.boards || []).filter((b) => b.linkOk).length,
  boardsTotal: (sources.boards || []).length,
  bookmarksOk: (sources.bookmarkBoards || []).filter((b) => b.linkOk).length,
  bookmarksTotal: (sources.bookmarkBoards || []).length,
};
sources.generatedAt = checkedAt;

fs.writeFileSync(empresasPath, JSON.stringify(empresas, null, 2) + "\n");
fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
fs.writeFileSync(
  careersStatusPath,
  JSON.stringify(
    {
      generatedAt: checkedAt,
      total: careerResults.length,
      ok: careerResults.filter((c) => c.linkOk).length,
      fail: careerResults.filter((c) => !c.linkOk).length,
      links: careerResults.sort((a, b) => a.name.localeCompare(b.name)),
    },
    null,
    2
  ) + "\n"
);

const health = {
  generatedAt: checkedAt,
  total: healthLinks.length,
  ok: healthLinks.filter((l) => l.ok).length,
  fail: healthLinks.filter((l) => !l.ok).length,
  uniqueUrls: uniqueUrls.length,
  links: healthLinks,
};
fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + "\n");

console.log(
  `\nDone: ${health.ok} ok / ${health.fail} fail of ${health.total} stamps (${uniqueUrls.length} unique)`
);
console.log(`  empresas.json · sources.json · career-link-status.json · link-health.json`);
