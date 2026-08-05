/**
 * Catalog of sources to health-check.
 * Critical = must return data for aggregator quality.
 * Deeplinks = HTTP reachability only (HTML boards, no job parse).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeepLinks } from "../../assets/js/sources/deeplinks.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const ROOT = root;

/** Public JSON APIs used live in the browser or Actions */
export const LIVE_APIS = [
  {
    id: "remoteok",
    critical: true,
    url: "https://remoteok.com/api",
    kind: "json",
    minItems: 5,
    pick: (d) => (Array.isArray(d) ? d.filter((x) => x.id && x.position) : []),
  },
  {
    id: "remotive",
    critical: true,
    url: "https://remotive.com/api/remote-jobs?category=software-dev",
    kind: "json",
    minItems: 5,
    pick: (d) => d.jobs || [],
  },
  {
    id: "arbeitnow",
    critical: true,
    url: "https://www.arbeitnow.com/api/job-board-api",
    kind: "json",
    minItems: 5,
    pick: (d) => d.data || [],
  },
  {
    id: "jobicy",
    critical: true,
    url: "https://jobicy.com/api/v2/remote-jobs?count=20",
    kind: "json",
    minItems: 3,
    pick: (d) => d.jobs || [],
  },
  {
    id: "himalayas",
    critical: true,
    url: "https://himalayas.app/jobs/api?limit=20&offset=0",
    kind: "json",
    minItems: 5,
    pick: (d) => d.jobs || [],
  },
  {
    id: "themuse",
    critical: false,
    url: "https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=0",
    kind: "json",
    minItems: 3,
    pick: (d) => d.results || [],
  },
  {
    id: "remotejobsorg",
    critical: false,
    url: "https://remotejobs.org/api/v1/jobs?category=programming&limit=20&type=full-time",
    kind: "json",
    minItems: 3,
    pick: (d) => d.data || [],
  },
];

/** Sample public ATS boards (noble-ronin / hire-signal pattern) */
export const ATS_SAMPLES = [
  {
    id: "greenhouse:stripe",
    critical: true,
    ats: "greenhouse",
    url: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=false",
    minItems: 10,
    pick: (d) => d.jobs || [],
  },
  {
    id: "lever:spotify",
    critical: true,
    ats: "lever",
    url: "https://api.lever.co/v0/postings/spotify?mode=json",
    minItems: 5,
    pick: (d) => (Array.isArray(d) ? d : []),
  },
  {
    id: "ashby:openai",
    critical: true,
    ats: "ashby",
    url: "https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true",
    minItems: 10,
    pick: (d) => d.jobs || [],
  },
  {
    id: "ashby:posthog",
    critical: false,
    ats: "ashby",
    url: "https://api.ashbyhq.com/posting-api/job-board/posthog?includeCompensation=true",
    minItems: 1,
    pick: (d) => d.jobs || [],
  },
  {
    id: "workable:codurance",
    critical: false,
    ats: "workable",
    url: "https://apply.workable.com/api/v1/widget/accounts/codurance",
    minItems: 1,
    pick: (d) => d.jobs || [],
  },
  {
    id: "smartrecruiters:Visa",
    critical: false,
    ats: "smartrecruiters",
    url: "https://api.smartrecruiters.com/v1/companies/Visa/postings?limit=20&offset=0",
    minItems: 1,
    pick: (d) => d.content || [],
  },
  {
    id: "workday:csgi",
    critical: false,
    ats: "workday",
    kind: "workday-cxs",
    url: "https://csgi.wd5.myworkdayjobs.com/wday/cxs/csgi/CSGCareers/jobs",
    minItems: 1,
    pick: (d) => d.jobPostings || [],
  },
];

/** RSS feeds used by fetch-rss.mjs */
export const RSS_FEEDS = [
  {
    id: "wwr-programming",
    critical: true,
    url: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    kind: "rss",
    minItems: 3,
  },
  {
    id: "wwr-fullstack",
    critical: false,
    url: "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    kind: "rss",
    minItems: 3,
  },
];

/** Local static caches consumed by adapters */
export const STATIC_CACHES = [
  {
    id: "static-ats",
    path: "data/ats-jobs.json",
    critical: true,
    minJobs: 500,
    pick: (d) => d.jobs || [],
  },
  {
    id: "apinfo",
    path: "data/apinfo-jobs.json",
    critical: true,
    minJobs: 50,
    pick: (d) => d.jobs || [],
  },
  {
    id: "himalayas-cache",
    path: "data/himalayas-jobs.json",
    critical: true,
    minJobs: 50,
    pick: (d) => d.jobs || [],
  },
  {
    id: "themuse-cache",
    path: "data/themuse-jobs.json",
    critical: false,
    minJobs: 20,
    pick: (d) => d.jobs || [],
  },
  {
    id: "remotejobsorg-cache",
    path: "data/remotejobsorg-jobs.json",
    critical: false,
    minJobs: 20,
    pick: (d) => d.data || d.jobs || [],
  },
  {
    id: "weworkremotely-cache",
    path: "data/weworkremotely-jobs.json",
    critical: true,
    minJobs: 50,
    pick: (d) => d.jobs || [],
  },
  {
    id: "companies",
    path: "data/companies.json",
    critical: true,
    minJobs: 1,
    pick: (d) => [
      ...(d.greenhouse || []),
      ...(d.lever || []),
      ...(d.ashby || []),
      ...(d.workable || []),
    ],
  },
];

/** Core deeplink homes — reachability only */
export const DEEPLINK_HOMES = [
  { id: "linkedin", url: "https://www.linkedin.com/jobs/", critical: true },
  { id: "indeed-br", url: "https://br.indeed.com/", critical: true },
  { id: "google", url: "https://www.google.com/", critical: true },
  { id: "glassdoor", url: "https://www.glassdoor.com/", critical: false },
  { id: "apinfo", url: "https://www.apinfo.com/", critical: true },
  { id: "remotar", url: "https://remotar.com.br/", critical: false },
  { id: "gupy", url: "https://portal.gupy.io/", critical: false },
  { id: "remoteok-web", url: "https://remoteok.com/", critical: false },
  { id: "wwr-web", url: "https://weworkremotely.com/", critical: false },
  { id: "himalayas-web", url: "https://himalayas.app/jobs", critical: false },
  { id: "remotive-web", url: "https://remotive.com/", critical: false },
  { id: "wellfound", url: "https://wellfound.com/", critical: false },
  { id: "torre", url: "https://torre.co/", critical: false },
  { id: "workana", url: "https://www.workana.com/", critical: false },
  { id: "programathor", url: "https://programathor.com.br/", critical: false },
  { id: "geekhunter", url: "https://geekhunter.com.br/", critical: false },
  { id: "revelo", url: "https://revelo.com.br/", critical: false },
  { id: "vagascom", url: "https://www.vagas.com.br/", critical: false },
  { id: "catho", url: "https://www.catho.com.br/vagas/empregos.html", critical: false },
  { id: "infojobs", url: "https://www.infojobs.com.br/", critical: false },
  { id: "toptal", url: "https://www.toptal.com/", critical: false },
  { id: "turing", url: "https://www.turing.com/", critical: false },
  { id: "vanhack", url: "https://vanhack.com/", critical: false },
  { id: "gitlab", url: "https://about.gitlab.com/jobs/", critical: false },
  { id: "shopify", url: "https://www.shopify.com/careers", critical: false },
  { id: "seek-nz", url: "https://www.seek.co.nz/", critical: false },
  { id: "seek-au", url: "https://www.seek.com.au/", critical: false },
  { id: "bayt", url: "https://www.bayt.com/", critical: false },
  { id: "gulftalent", url: "https://www.gulftalent.com/", critical: false },
  { id: "naukrigulf", url: "https://www.naukrigulf.com/", critical: false },
  { id: "laimoon", url: "https://jobs.laimoon.com/uae", critical: false },
  { id: "reed", url: "https://www.reed.co.uk/", critical: false },
  { id: "landingjobs", url: "https://landing.jobs/", critical: false },
  { id: "eurojobs", url: "https://eurojobs.com/", critical: false },
  { id: "stepstone", url: "https://www.stepstone.de/", critical: false },
  { id: "jobfluent", url: "https://jobfluent.com/", critical: false },
  { id: "eures", url: "https://europa.eu/eures/portal/jv-se/home", critical: false },
  { id: "jora-au", url: "https://au.jora.com/", critical: false },
  { id: "trademe-jobs", url: "https://www.trademe.co.nz/a/jobs", critical: false },
  { id: "jobsearch-gov-au", url: "https://www.workforceaustralia.gov.au/individuals/jobs/search", critical: false },
];

export function builtDeeplinkUrls(filters = { keywords: ".NET", geo: "brazil", workplace: "remote" }) {
  return buildDeepLinks(filters).map((l) => ({
    id: `deeplink:${l.id}`,
    url: l.url,
    name: l.name,
    group: l.group,
    critical: ["linkedin", "indeed", "googlejobs", "glassdoor"].includes(l.id),
  }));
}

export function jobShapeOk(job) {
  if (!job || typeof job !== "object") return false;
  if (!job.title || typeof job.title !== "string") return false;
  if (!job.url || typeof job.url !== "string") return false;
  if (job.url !== "#" && !/^https?:\/\//i.test(job.url)) return false;
  return true;
}
