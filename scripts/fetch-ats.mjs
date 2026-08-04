#!/usr/bin/env node
/**
 * Fetch Greenhouse / Lever / Ashby / Workable / SmartRecruiters / Recruitee
 * boards into data/ats-jobs.json
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
  /\b(software|engineer|developer|devops|sre|backend|frontend|full[\s-]?stack|mobile|ios|android|data engineer|machine learning|ml engineer|ai engineer|cloud|platform|security engineer|qa|quality assurance|test automation|typescript|javascript|python|java\b|golang|rust|kotlin|\.net|c#|react|node\.?js|kubernetes|infrastructure|site reliability|product engineer|engineering|desenvolvedor|programador)\b/i;

const NON_IT_RE =
  /\b(accountant|counsel|attorney|nurse|sales development representative|account executive|customer success manager|recruiter|talent acquisition|office manager|facilities|barista|driver)\b/i;

function isItJob(job) {
  const blob = `${job.title} ${(job.tags || []).join(" ")} ${job.description || ""}`;
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

async function fetchWorkable(slug) {
  const data = await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`
  );
  const companyName = data.name || slug;
  return (data.jobs || []).map((j) => ({
    id: `workable:${slug}:${j.shortcode || j.id || j.title}`,
    ats: "workable",
    company: companyName,
    title: j.title,
    url: j.url || `https://apply.workable.com/${slug}/j/${j.shortcode}/`,
    description: stripHtml(j.description || j.shortcode || ""),
    location: [j.city, j.state, j.country, j.workplace].filter(Boolean).join(", ") || "Remote",
    tags: [slug, "workable", j.department, j.function].filter(Boolean),
    jobType: j.employment_type || j.type || null,
    postedAt: j.published_on || j.created_at || null,
  }));
}

async function fetchSmartRecruiters(slug) {
  const jobs = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 8; page++) {
    const data = await fetchJson(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${limit}&offset=${offset}`
    );
    const batch = data.content || data.postings || [];
    for (const j of batch) {
      jobs.push({
        id: `smartrecruiters:${slug}:${j.id || j.uuid}`,
        ats: "smartrecruiters",
        company: j.company?.name || slug,
        title: j.name || j.title,
        url: j.ref || j.applyUrl || `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
        description: stripHtml(j.jobAd?.sections?.jobDescription?.text || j.description || ""),
        location: j.location?.city
          ? `${j.location.city}${j.location.country ? ", " + j.location.country : ""}`
          : j.location?.remote ? "Remote" : "Remote",
        tags: [slug, "smartrecruiters", j.department?.label, j.function?.label].filter(Boolean),
        jobType: j.typeOfEmployment?.label || null,
        postedAt: j.releasedDate || j.createdOn || null,
      });
    }
    if (!batch.length || batch.length < limit) break;
    offset += batch.length;
    await new Promise((r) => setTimeout(r, 150));
  }
  return jobs;
}

async function fetchRecruitee(slug) {
  const data = await fetchJson(
    `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`
  );
  const offers = data.offers || data || [];
  return (Array.isArray(offers) ? offers : []).map((j) => ({
    id: `recruitee:${slug}:${j.id || j.slug}`,
    ats: "recruitee",
    company: j.company_name || slug,
    title: j.title,
    url: j.careers_url || j.url || `https://${slug}.recruitee.com/o/${j.slug}`,
    description: stripHtml(j.description || j.requirements || ""),
    location: j.location || (j.remote ? "Remote" : "") || "Remote",
    tags: [slug, "recruitee", ...(j.tags || [])].filter(Boolean),
    jobType: j.employment_type_code || j.employment_type || null,
    postedAt: j.published_at || j.created_at || null,
  }));
}

async function settleAll(label, slugs, fn) {
  const jobs = [];
  const errors = [];
  const list = [...new Set((slugs || []).filter(Boolean))];
  const results = await Promise.allSettled(
    list.map(async (slug) => {
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
const wk = await settleAll("workable", companies.workable || [], fetchWorkable);
const sr = await settleAll(
  "smartrecruiters",
  companies.smartrecruiters || [],
  fetchSmartRecruiters
);
const rc = await settleAll("recruitee", companies.recruitee || [], fetchRecruitee);

const raw = [...gh.jobs, ...lv.jobs, ...ash.jobs, ...wk.jobs, ...sr.jobs, ...rc.jobs];
const jobs = raw.filter(isItJob).map(compact);
const payload = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  count: jobs.length,
  rawCount: raw.length,
  byAts: {
    greenhouse: gh.jobs.filter(isItJob).length,
    lever: lv.jobs.filter(isItJob).length,
    ashby: ash.jobs.filter(isItJob).length,
    workable: wk.jobs.filter(isItJob).length,
    smartrecruiters: sr.jobs.filter(isItJob).length,
    recruitee: rc.jobs.filter(isItJob).length,
  },
  errors: [...gh.errors, ...lv.errors, ...ash.errors, ...wk.errors, ...sr.errors, ...rc.errors],
  jobs,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(
  `Wrote ${jobs.length} IT jobs (from ${raw.length} raw) → data/ats-jobs.json`,
  payload.byAts
);
