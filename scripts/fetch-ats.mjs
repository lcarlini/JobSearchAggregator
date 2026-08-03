#!/usr/bin/env node
/**
 * Fetch Greenhouse / Lever / Ashby boards into data/ats-jobs.json
 * Usage: node scripts/fetch-ats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const companiesPath = path.join(root, "data", "companies.json");
const outPath = path.join(root, "data", "ats-jobs.json");

const companies = JSON.parse(fs.readFileSync(companiesPath, "utf8"));

function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const IT_RE =
  /\b(software|engineer|developer|devops|sre|backend|frontend|full[\s-]?stack|mobile|ios|android|data engineer|machine learning|ml engineer|ai engineer|cloud|platform|security engineer|qa|quality assurance|test automation|typescript|javascript|python|java\b|golang|rust|kotlin|\.net|c#|react|node\.?js|kubernetes|infrastructure|site reliability|product engineer|engineering)\b/i;

const NON_IT_RE =
  /\b(accountant|counsel|attorney|nurse|sales development representative|account executive|customer success manager|recruiter|talent acquisition|office manager|facilities|barista|driver)\b/i;

function isItJob(job) {
  const blob = `${job.title} ${(job.tags || []).join(" ")}`;
  if (NON_IT_RE.test(blob) && !IT_RE.test(blob)) return false;
  return IT_RE.test(blob);
}

function compact(job) {
  return {
    id: job.id,
    ats: job.ats,
    company: job.company,
    title: job.title,
    url: job.url,
    description: stripHtml(job.description || "").slice(0, 500),
    location: job.location || "Remote",
    tags: (job.tags || []).filter(Boolean).slice(0, 8),
    jobType: job.jobType || null,
    postedAt: job.postedAt || null,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchGreenhouse(slug) {
  const data = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`
  );
  return (data.jobs || []).map((j) => ({
    id: `greenhouse:${slug}:${j.id}`,
    ats: "greenhouse",
    company: slug,
    title: j.title,
    url: j.absolute_url,
    description: stripHtml(j.content || ""),
    location: j.location?.name || "Remote",
    tags: [slug, "greenhouse"],
    postedAt: j.updated_at || j.created_at || null,
  }));
}

async function fetchLever(slug) {
  const data = await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  );
  return (Array.isArray(data) ? data : []).map((j) => ({
    id: `lever:${slug}:${j.id}`,
    ats: "lever",
    company: j.categories?.team || slug,
    title: j.text,
    url: j.hostedUrl || j.applyUrl,
    description: stripHtml(j.descriptionPlain || j.description || ""),
    location: j.categories?.location || "Remote",
    tags: [slug, "lever", j.categories?.commitment].filter(Boolean),
    jobType: j.categories?.commitment,
    postedAt: j.createdAt || null,
  }));
}

async function fetchAshby(slug) {
  const data = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`
  );
  return (data.jobs || []).map((j) => ({
    id: `ashby:${slug}:${j.id}`,
    ats: "ashby",
    company: slug,
    title: j.title,
    url: j.jobUrl || j.applyUrl,
    description: j.descriptionPlain || stripHtml(j.descriptionHtml || ""),
    location: j.location || (j.isRemote ? "Remote" : ""),
    tags: [slug, "ashby", j.department].filter(Boolean),
    jobType: j.employmentType,
    postedAt: j.publishedAt || j.updatedAt || null,
  }));
}

async function settleAll(label, slugs, fn) {
  const jobs = [];
  const errors = [];
  const results = await Promise.allSettled(
    slugs.map(async (slug) => {
      try {
        const rows = await fn(slug);
        console.log(`  ${label}/${slug}: ${rows.length}`);
        return rows;
      } catch (e) {
        errors.push({ board: `${label}/${slug}`, error: e.message });
        console.warn(`  ${label}/${slug}: FAIL ${e.message}`);
        return [];
      }
    })
  );
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
  }
  return { jobs, errors };
}

const started = Date.now();
console.log("Fetching ATS boards…");

const gh = await settleAll("greenhouse", companies.greenhouse || [], fetchGreenhouse);
const lv = await settleAll("lever", companies.lever || [], fetchLever);
const ash = await settleAll("ashby", companies.ashby || [], fetchAshby);

const raw = [...gh.jobs, ...lv.jobs, ...ash.jobs];
const jobs = raw.filter(isItJob).map(compact);
const payload = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  count: jobs.length,
  rawCount: raw.length,
  errors: [...gh.errors, ...lv.errors, ...ash.errors],
  jobs,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(
  `Wrote ${jobs.length} IT jobs (from ${raw.length} raw) → data/ats-jobs.json`
);
