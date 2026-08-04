#!/usr/bin/env node
/**
 * Fetch public ATS job boards → data/ats-jobs.json
 *
 * Patterns from open-source aggregators (no LinkedIn scrape):
 * - noble-ronin/ats-job-apis — Greenhouse/Lever/Ashby/SR/Recruitee/Breezy/Bamboo/Personio
 * - AndrewPalet/hire-signal — large verified slug lists (merged into companies.json)
 * - Babak-hasani/company-career-scraper — ATS probe order, Lever/Greenhouse EU quirks,
 *   SmartRecruiters false-positive guard (require ≥1 job), concurrency + User-Agent
 * - bonus414/job-scanner — Ashby boards (pinecone/modal/posthog/sentry)
 *
 * Usage: node scripts/fetch-ats.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeWorkdayBoard,
  workdayJobsUrl,
  workdayPublicJobUrl,
} from "./lib/workday.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const companiesPath = path.join(root, "data", "companies.json");
const outPath = path.join(root, "data", "ats-jobs.json");
const CONCURRENCY = 8;

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
    salary: job.salary || null,
    postedAt: job.postedAt || null,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, application/xml, text/xml, */*",
      "User-Agent": "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("xml") || url.endsWith("/xml")) return res.text();
  return res.json();
}

async function fetchGreenhouse(slug) {
  // Standard US API; EU boards often still answer here (Babak notes job-boards.eu as alternate UI)
  let data;
  try {
    data = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`
    );
  } catch (e) {
    // Greenhouse EU job board JSON mirror used by some EU tenants
    if (!String(e.message).includes("404")) throw e;
    data = await fetchJson(
      `https://job-boards.greenhouse.io/${encodeURIComponent(slug)}/jobs?content=true`
    );
  }
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
  // US host first; EU accounts live on api.eu.lever.co (DEV/community pattern)
  let data;
  try {
    data = await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
    );
  } catch (e) {
    if (!String(e.message).includes("404")) throw e;
    data = await fetchJson(
      `https://api.eu.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
    );
  }
  return (Array.isArray(data) ? data : []).map((j) => ({
    id: `lever:${slug}:${j.id}`,
    ats: "lever",
    company: j.categories?.team || slug,
    title: j.text,
    url: j.hostedUrl || j.applyUrl,
    description: stripHtml(j.descriptionPlain || j.description || ""),
    location: j.categories?.location || j.workplaceType || "Remote",
    tags: [slug, "lever", j.categories?.commitment, j.workplaceType].filter(Boolean),
    jobType: j.categories?.commitment,
    postedAt: j.createdAt || null,
  }));
}

function ashbySalary(j) {
  const c = j.compensation || j.compensationTierSummary;
  if (!c) return null;
  if (typeof c === "string") return c;
  if (c.summary) return c.summary;
  if (c.compensationTierSummary) return c.compensationTierSummary;
  const min = c.minSalary ?? c.minCash ?? c.salaryMin;
  const max = c.maxSalary ?? c.maxCash ?? c.salaryMax;
  if (min || max) return [min, max].filter((x) => x != null).join(" – ");
  return null;
}

async function fetchAshby(slug) {
  // includeCompensation=true — pattern from noble-ronin + Ashby docs
  const data = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`
  );
  return (data.jobs || []).map((j) => {
    const loc =
      typeof j.location === "string"
        ? j.location
        : j.location?.name || (j.isRemote ? "Remote" : "");
    return {
      id: `ashby:${slug}:${j.id}`,
      ats: "ashby",
      company: slug,
      title: j.title,
      url: j.jobUrl || j.applyUrl,
      description: j.descriptionPlain || stripHtml(j.descriptionHtml || ""),
      location: loc || "Remote",
      tags: [slug, "ashby", j.department].filter(Boolean),
      jobType: j.employmentType,
      salary: ashbySalary(j),
      postedAt: j.publishedAt || j.updatedAt || null,
    };
  });
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
    description: stripHtml(j.description || ""),
    location: [j.city, j.state, j.country, j.workplace].filter(Boolean).join(", ") || "Remote",
    tags: [slug, "workable", j.department, j.function].filter(Boolean),
    jobType: j.employment_type || j.type || null,
    postedAt: j.published_on || j.created_at || null,
  }));
}

async function fetchSmartRecruiters(slug) {
  // Babak: SR returns 200 + 0 jobs for invalid names — only keep real postings
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
          : j.location?.remote
            ? "Remote"
            : "Remote",
        tags: [slug, "smartrecruiters", j.department?.label, j.function?.label].filter(Boolean),
        jobType: j.typeOfEmployment?.label || null,
        postedAt: j.releasedDate || j.createdOn || null,
      });
    }
    if (!batch.length || batch.length < limit) break;
    offset += batch.length;
    await new Promise((r) => setTimeout(r, 120));
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

async function fetchBreezy(slug) {
  const data = await fetchJson(`https://${encodeURIComponent(slug)}.breezy.hr/json`);
  const list = Array.isArray(data) ? data : data.positions || data.jobs || [];
  return list.map((j) => ({
    id: `breezy:${slug}:${j.id || j._id || j.friendly_id || j.name}`,
    ats: "breezy",
    company: slug,
    title: j.name || j.title,
    url: j.url || j.application_url || `https://${slug}.breezy.hr/p/${j.friendly_id || j.id}`,
    description: stripHtml(j.description || ""),
    location: j.location?.name || j.location || (j.is_remote ? "Remote" : "Remote"),
    tags: [slug, "breezy", j.department].filter(Boolean),
    jobType: j.type?.name || j.type || null,
    postedAt: j.published_date || j.created_date || null,
  }));
}

async function fetchBamboo(slug) {
  // BambooHR public careers list (noble-ronin / builder-jobs-scraper)
  const data = await fetchJson(
    `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`
  );
  const list = data.result || data.meta?.result || data.jobs || [];
  return (Array.isArray(list) ? list : []).map((j) => ({
    id: `bamboohr:${slug}:${j.id || j.jobOpeningId || j.atsLocationId || j.jobSharingTitle}`,
    ats: "bamboohr",
    company: slug,
    title: j.jobOpeningName || j.title || j.jobSharingTitle,
    url:
      j.jobOpeningShareUrl ||
      `https://${slug}.bamboohr.com/careers/${j.id || j.jobOpeningId}`,
    description: stripHtml(j.description || j.jobOpeningName || ""),
    location: j.location?.city
      ? `${j.location.city}${j.location.state ? ", " + j.location.state : ""}`
      : j.locationLabel || "Remote",
    tags: [slug, "bamboohr", j.departmentLabel].filter(Boolean),
    jobType: j.employmentStatusLabel || null,
    postedAt: j.datePosted || null,
  }));
}

function parsePersonioXml(xml, slug) {
  const jobs = [];
  const blocks = String(xml).match(/<position[\s>][\s\S]*?<\/position>/gi) || [];
  for (const block of blocks) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
      return m ? stripHtml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
    };
    const id = tag("id") || tag("name");
    const title = tag("name") || tag("title");
    if (!title) continue;
    const office = tag("office") || tag("city") || "";
    const country = tag("country") || "";
    const schedule = tag("schedule") || "";
    const desc = [tag("jobDescription"), tag("description"), tag("responsibilities")]
      .filter(Boolean)
      .join(" ");
    jobs.push({
      id: `personio:${slug}:${id || title}`,
      ats: "personio",
      company: slug,
      title,
      url: `https://${slug}.jobs.personio.com/job/${id}`,
      description: desc,
      location: [office, country, schedule].filter(Boolean).join(", ") || "Remote",
      tags: [slug, "personio", tag("department"), tag("employmentType")].filter(Boolean),
      jobType: tag("employmentType") || null,
      postedAt: tag("createdAt") || tag("updatedAt") || null,
    });
  }
  return jobs;
}

async function fetchPersonio(slug) {
  // Personio public XML feed — try .com then .de (EU)
  let xml;
  try {
    xml = await fetchJson(`https://${encodeURIComponent(slug)}.jobs.personio.com/xml`);
  } catch (e) {
    if (!String(e.message).includes("404") && !String(e.message).includes("429")) throw e;
    await new Promise((r) => setTimeout(r, 400));
    xml = await fetchJson(`https://${encodeURIComponent(slug)}.jobs.personio.de/xml`);
  }
  return parsePersonioXml(typeof xml === "string" ? xml : "", slug);
}

/**
 * Workday public CXS (career site JSON the UI calls).
 * Board: { id, host, tenant, site } — never guess wdN/site from a company name.
 */
async function fetchWorkday(boardIn) {
  const board = normalizeWorkdayBoard(boardIn);
  if (!board) throw new Error("invalid workday board");
  const api = workdayJobsUrl(board);
  const jobs = [];
  const seen = new Set();
  const limit = 20;
  // Workday CXS often breaks offset pagination past ~2 pages; fan-out via searchText.
  const searches = ["", "software", "engineer", "developer", ".NET", "backend", "remote"];

  for (const searchText of searches) {
    let offset = 0;
    let total = Infinity;
    for (let page = 0; page < 8 && offset < total; page++) {
      const res = await fetch(api, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "JobSearchAggregator/1.0 (+https://github.com/lcarlini/JobSearchAggregator)",
          Referer: `https://${board.host}/${board.site}`,
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit,
          offset,
          searchText,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      total = Number(data.total) || 0;
      const postings = data.jobPostings || [];
      if (!postings.length) break;
      for (const j of postings) {
        const path = j.externalPath || "";
        const idPart = path.split("/").filter(Boolean).pop() || `${offset}`;
        const id = `workday:${board.id}:${idPart}`;
        if (seen.has(id)) continue;
        seen.add(id);
        jobs.push({
          id,
          ats: "workday",
          company: board.tenant,
          title: j.title || "Untitled",
          url: workdayPublicJobUrl(board, path),
          description: "",
          location: j.locationsText || j.bulletFields?.[0] || "Remote",
          tags: [board.tenant, "workday", board.site],
          postedAt: j.postedOn || j.publishedAt || null,
        });
      }
      offset += postings.length;
      if (postings.length < limit) break;
    }
  }
  return jobs;
}

async function settleAll(label, slugs, fn, { concurrency = CONCURRENCY, delayMs = 0 } = {}) {
  const jobs = [];
  const errors = [];
  const list = [...new Set((slugs || []).filter(Boolean))];
  if (!list.length) return { jobs, errors };
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const idx = cursor++;
      const slug = list[idx];
      try {
        const rows = await fn(slug);
        console.log(`  ${label}/${slug}: ${rows.length}`);
        jobs.push(...rows);
      } catch (e) {
        errors.push({ board: `${label}/${slug}`, error: e.message });
        console.warn(`  ${label}/${slug}: FAIL ${e.message}`);
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const n = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return { jobs, errors };
}

async function settleWorkday(boards, { concurrency = 3, delayMs = 120 } = {}) {
  const jobs = [];
  const errors = [];
  const seen = new Set();
  const list = [];
  for (const raw of boards || []) {
    const b = normalizeWorkdayBoard(raw);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    list.push(b);
  }
  if (!list.length) return { jobs, errors };
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const idx = cursor++;
      const board = list[idx];
      try {
        const rows = await fetchWorkday(board);
        console.log(`  workday/${board.id}: ${rows.length}`);
        jobs.push(...rows);
      } catch (e) {
        errors.push({ board: `workday/${board.id}`, error: e.message });
        console.warn(`  workday/${board.id}: FAIL ${e.message}`);
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const n = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return { jobs, errors };
}

const started = Date.now();
console.log(
  `Fetching ATS boards (concurrency=${CONCURRENCY}) from ${companies.source || "companies.json"}…`
);

const gh = await settleAll("greenhouse", companies.greenhouse || [], fetchGreenhouse);
const lv = await settleAll("lever", companies.lever || [], fetchLever);
const ash = await settleAll("ashby", companies.ashby || [], fetchAshby);
const wk = await settleAll("workable", companies.workable || [], fetchWorkable);
const sr = await settleAll(
  "smartrecruiters",
  companies.smartrecruiters || [],
  fetchSmartRecruiters,
  { concurrency: 4, delayMs: 80 }
);
const rc = await settleAll("recruitee", companies.recruitee || [], fetchRecruitee, {
  concurrency: 4,
});
const br = await settleAll("breezy", companies.breezy || [], fetchBreezy, { concurrency: 4 });
const bb = await settleAll("bamboohr", companies.bamboohr || [], fetchBamboo, {
  concurrency: 4,
});
const pe = await settleAll("personio", companies.personio || [], fetchPersonio, {
  concurrency: 2,
  delayMs: 350,
});
const wd = await settleWorkday(companies.workday || [], { concurrency: 3, delayMs: 120 });

const raw = [
  ...gh.jobs,
  ...lv.jobs,
  ...ash.jobs,
  ...wk.jobs,
  ...sr.jobs,
  ...rc.jobs,
  ...br.jobs,
  ...bb.jobs,
  ...pe.jobs,
  ...wd.jobs,
];
const jobs = raw.filter(isItJob).map(compact);
const countIt = (arr) => arr.filter(isItJob).length;
const payload = {
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  count: jobs.length,
  rawCount: raw.length,
  byAts: {
    greenhouse: countIt(gh.jobs),
    lever: countIt(lv.jobs),
    ashby: countIt(ash.jobs),
    workable: countIt(wk.jobs),
    smartrecruiters: countIt(sr.jobs),
    recruitee: countIt(rc.jobs),
    breezy: countIt(br.jobs),
    bamboohr: countIt(bb.jobs),
    personio: countIt(pe.jobs),
    workday: countIt(wd.jobs),
  },
  errors: [
    ...gh.errors,
    ...lv.errors,
    ...ash.errors,
    ...wk.errors,
    ...sr.errors,
    ...rc.errors,
    ...br.errors,
    ...bb.errors,
    ...pe.errors,
    ...wd.errors,
  ],
  jobs,
};

fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(
  `Wrote ${jobs.length} IT jobs (from ${raw.length} raw) in ${(payload.elapsedMs / 1000).toFixed(1)}s → data/ats-jobs.json`,
  payload.byAts
);
