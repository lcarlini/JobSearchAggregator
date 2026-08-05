/**
 * Manual board export schema (LinkedIn / Indeed / Glassdoor console scrapers).
 * Compatible with JobSearchAggregator makeJob() ingest.
 */
import { makeJob, dedupeJobs } from "../normalize.js";

export const MANUAL_SCHEMA_VERSION = 1;
export const MANUAL_BRAND = "JobSearchAggregatorManualExport";

export const MANUAL_SOURCES = [
  {
    id: "linkedin",
    name: "LinkedIn Jobs",
    hostHint: "linkedin.com",
    notes: "Cole o script no console enquanto estiver logado em linkedin.com/jobs",
  },
  {
    id: "indeed",
    name: "Indeed",
    hostHint: "indeed.com",
    notes: "Abra a busca Indeed gerada e cole o script no console",
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    hostHint: "glassdoor.",
    notes: "Abra a busca Glassdoor gerada e cole o script no console",
  },
  {
    id: "seek",
    name: "SEEK (AU/NZ)",
    hostHint: "seek.",
    notes: "Abra seek.com.au ou seek.co.nz e cole o script — sem API pública",
  },
  {
    id: "stepstone",
    name: "StepStone",
    hostHint: "stepstone.",
    notes: "Abra stepstone.de com a busca gerada e cole o script no console",
  },
  {
    id: "eurojobs",
    name: "EuroJobs",
    hostHint: "eurojobs.com",
    notes: "SPA sem feed estável — abra a busca, filtre What/Where e cole o script",
  },
];

/**
 * @param {object} opts
 * @returns {object}
 */
export function buildExportPayload({
  source,
  searchUrl,
  filters = {},
  jobs = [],
  meta = {},
} = {}) {
  return {
    schemaVersion: MANUAL_SCHEMA_VERSION,
    brand: MANUAL_BRAND,
    source,
    generatedAt: new Date().toISOString(),
    searchUrl: searchUrl || null,
    filters,
    meta: {
      count: jobs.length,
      ...meta,
    },
    jobs,
  };
}

export function isManualExport(data) {
  if (!data || typeof data !== "object") return false;
  if (data.brand === MANUAL_BRAND && Array.isArray(data.jobs)) return true;
  // Accept loose arrays / JobSpy-like shapes
  if (Array.isArray(data)) return true;
  if (Array.isArray(data.jobs)) return true;
  return false;
}

function pickJob(raw, sourceFallback) {
  if (!raw || typeof raw !== "object") return null;
  const title = raw.title || raw.position || raw.job_title || raw.name;
  const url =
    raw.url ||
    raw.link ||
    raw.job_url ||
    raw.jobUrl ||
    raw.applyUrl ||
    raw.href;
  if (!title || !url) return null;
  const company =
    raw.company ||
    raw.company_name ||
    raw.companyName ||
    raw.employer ||
    "—";
  const location =
    raw.location ||
    raw.place ||
    raw.job_location ||
    raw.city ||
    "Remote";
  const description =
    raw.description ||
    raw.descriptionPlain ||
    raw.snippet ||
    raw.insights ||
    "";
  const postedAt =
    raw.postedAt ||
    raw.date ||
    raw.date_posted ||
    raw.listDate ||
    raw.publishedAt ||
    null;
  const source = raw.source || sourceFallback || "manual";
  const id = raw.id || raw.jobId || raw.job_id || null;
  return makeJob({
    id: id ? `${source}:${id}` : undefined,
    source,
    title,
    company,
    url: String(url).split("?")[0],
    description: String(description).slice(0, 2000),
    location,
    salary: raw.salary || raw.salary_range || null,
    postedAt,
    tags: [source, ...(raw.tags || [])].filter(Boolean),
    raw,
  });
}

/**
 * Parse uploaded JSON (our schema, raw array, or JobSpy-like).
 * @param {unknown} data
 * @returns {{ jobs: object[], source: string, filters: object, meta: object, searchUrl: string|null }}
 */
export function parseManualExport(data) {
  let rows = [];
  let source = "manual";
  let filters = {};
  let meta = {};
  let searchUrl = null;

  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === "object") {
    source = data.source || "manual";
    filters = data.filters || {};
    meta = data.meta || {};
    searchUrl = data.searchUrl || null;
    rows = Array.isArray(data.jobs) ? data.jobs : [];
  }

  const jobs = dedupeJobs(
    rows.map((r) => pickJob(r, source)).filter(Boolean)
  );

  return { jobs, source, filters, meta, searchUrl };
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
