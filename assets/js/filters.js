/** Client-side filter + sort over normalized jobs. */

function splitTerms(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function includesAll(haystack, terms) {
  if (!terms.length) return true;
  return terms.every((t) => haystack.includes(t));
}

function includesNone(haystack, terms) {
  if (!terms.length) return true;
  return terms.every((t) => !haystack.includes(t));
}

function includesAny(haystack, terms) {
  if (!terms.length) return true;
  return terms.some((t) => haystack.includes(t));
}

function withinRecency(postedAt, recency) {
  if (!recency || recency === "any") return true;
  // Unknown dates: keep the job (most ATS boards omit reliable timestamps)
  if (postedAt == null) return true;
  const hours = {
    "2h": 2,
    "8h": 8,
    "24h": 24,
    "3d": 72,
    "7d": 168,
    "14d": 336,
    "30d": 720,
  }[recency];
  if (!hours) return true;
  return Date.now() - postedAt <= hours * 3600 * 1000;
}

function filterValues(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  const parts = splitTerms(value);
  if (!parts.length || parts.includes("any")) return [];
  return parts;
}

function matchSingleGeo(job, geo) {
  const g = job.geo || {};
  const loc = `${job.location || ""} ${job.description || ""}`.toLowerCase();
  switch (geo) {
    case "brazil":
      return g.brazil || /\bbrasil|brazil\b/.test(loc);
    case "worldwide":
      return true;
    case "latam":
      // Soft geo: keep remote/worldwide boards. Only drop clearly non-LATAM onsite roles.
      if (g.latamFriendly || g.brazil || g.worldwide) return true;
      if (
        job.remotePolicy === "country-restricted" ||
        job.remotePolicy === "emea-only" ||
        job.remotePolicy === "us-only"
      ) {
        return false;
      }
      if (
        job.workplace === "onsite" &&
        (g.uk || g.us || g.australia || g.europe) &&
        !/\bbrazil|brasil|latam|latin america\b/.test(loc)
      ) {
        return false;
      }
      return true;
    case "uk-br":
      return (
        g.uk ||
        (/\buk\b|united kingdom|london/.test(loc) &&
          (g.latamFriendly || g.brazil || g.worldwide || /brazil|brasil|latam|anywhere/.test(loc)))
      );
    case "au-br":
      return (
        g.australia ||
        (/\baustralia|sydney|melbourne/.test(loc) &&
          (g.latamFriendly || g.brazil || g.worldwide || /brazil|brasil|latam|anywhere/.test(loc)))
      );
    case "europe":
      return g.europe || /\beurope|emea|portugal|germany|netherlands|ireland|spain\b/.test(loc);
    case "us":
      return g.us || /\bunited states|usa|u\.s\./.test(loc);
    default:
      return loc.includes(String(geo).toLowerCase());
  }
}

/** Multi-geo: OR — job matches if it fits any selected market. */
function matchGeo(job, geo) {
  const wanted = filterValues(geo);
  if (!wanted.length) return true;
  return wanted.some((g) => matchSingleGeo(job, g));
}

function matchJobType(job, jobType) {
  const wanted = filterValues(jobType);
  if (!wanted.length) return true;
  return wanted.some((jt) => {
    if (jt === "freelance" || jt === "contract" || jt === "temporary") {
      return (
        ["freelance", "contract", "temporary"].includes(job.jobType) ||
        job.engagement === "contractor" ||
        job.engagement === "freelance"
      );
    }
    return job.jobType === jt;
  });
}

/** Multi-workplace: OR — remote|hybrid|onsite can combine. */
function matchWorkplace(job, workplace) {
  const wanted = filterValues(workplace);
  if (!wanted.length) return true;
  if (job.workplace === "unknown") {
    return wanted.includes("remote") || wanted.includes("hybrid");
  }
  return wanted.includes(job.workplace);
}

function matchEngagement(job, engagement) {
  if (!engagement || engagement === "any") return true;
  if (job.engagement === "unknown") return !filters.strictEligibility;
  return job.engagement === engagement;
}

function matchRemotePolicy(job, policy) {
  if (!policy || policy === "any") return true;
  const p = job.remotePolicy || "unknown";
  const blob = `${job.description} ${job.location}`.toLowerCase();
  switch (policy) {
    case "anywhere":
      return p === "anywhere" || job.geo?.worldwide || /\bwork from anywhere|worldwide\b/.test(blob);
    case "brazil-ok":
      return (
        p === "brazil-ok" ||
        job.geo?.brazil ||
        job.geo?.latamFriendly ||
        /\bbrazil ok|brasil|latam\b/.test(blob)
      );
    case "latam-only":
      return p === "latam-only" || (job.geo?.latamFriendly && !job.geo?.worldwide);
    case "country-restricted":
      return p === "country-restricted" || p === "emea-only";
    case "async":
      return p === "async" || /\basync|asynchronous\b/.test(blob);
    case "timezone-bound":
      return p === "timezone-bound" || (job.timezones && job.timezones.length > 0);
    default:
      return p === policy;
  }
}

function matchLanguage(job, language) {
  if (!language || language === "any") return true;
  // Soft: unlabeled jobs pass unless strict eligibility is on
  if (job.language === "unknown") return !filters.strictEligibility;
  return job.language === language;
}

function matchKeywords(job, keywords) {
  const terms = splitTerms(keywords);
  if (!terms.length) return true;
  const blob = `${job.title} ${job.company} ${job.tags.join(" ")} ${job.description}`.toLowerCase();
  return terms.some((t) => blob.includes(t));
}

function matchSkills(job, skills, mode = "any") {
  const terms = splitTerms(skills);
  if (!terms.length) return true;
  const blob = `${job.title} ${job.tags.join(" ")} ${job.description}`.toLowerCase();
  return mode === "all" ? includesAll(blob, terms) : includesAny(blob, terms);
}

function matchSeniority(job, seniority) {
  const wanted = filterValues(seniority);
  if (!wanted.length) return true;
  const t = `${job.title} ${job.description}`.toLowerCase();
  const map = {
    intern: /\b(intern|internship|estagiário|estagiario|trainee)\b/,
    junior: /\b(junior|jr\.?|entry[- ]level)\b/,
    mid: /\b(mid[- ]?level|pleno|intermediate)\b/,
    senior: /\b(senior|sr\.?|s[eê]nior)\b/,
    staff: /\b(staff|principal)\b/,
    lead: /\b(lead|tech lead|engineering manager|head of|director|l[ií]der)\b/,
  };
  return wanted.some((s) => {
    if (s === "senior+") {
      return map.senior.test(t) || map.staff.test(t) || map.lead.test(t);
    }
    return map[s] ? map[s].test(t) : true;
  });
}

function matchCompany(job, company) {
  const terms = splitTerms(company);
  if (!terms.length) return true;
  const name = (job.company || "").toLowerCase();
  return terms.some((t) => name.includes(t));
}

function matchHiddenCompanies(job, hidden) {
  const terms = splitTerms(hidden);
  if (!terms.length) return true;
  const name = (job.company || "").toLowerCase();
  return terms.every((t) => !name.includes(t));
}

function matchLocationText(job, country, state, city) {
  const loc = `${job.location || ""} ${job.description || ""}`.toLowerCase();
  if (country && country !== "any") {
    const map = {
      BR: /\b(brasil|brazil)\b/,
      US: /\b(united states|usa|u\.s\.)\b/,
      UK: /\b(united kingdom|uk|england)\b/,
      PT: /\b(portugal|lisbon|lisboa)\b/,
      DE: /\b(germany|deutschland|berlin)\b/,
      NL: /\b(netherlands|amsterdam)\b/,
      AU: /\b(australia|sydney|melbourne)\b/,
      remote: /\b(remote|remoto|worldwide|anywhere)\b/,
    };
    if (map[country] && !map[country].test(loc) && !job.geo?.worldwide) {
      // soft: allow worldwide remotes unless country-restricted
      if (job.remotePolicy === "country-restricted") return false;
      if (country !== "remote" && !job.geo?.worldwide && job.workplace === "onsite") return false;
    }
  }
  if (state && !loc.includes(state.toLowerCase())) {
    // soft pass if remote worldwide
    if (!(job.workplace === "remote" || job.geo?.worldwide)) return false;
  }
  if (city && !loc.includes(city.toLowerCase())) {
    if (!(job.workplace === "remote" || job.geo?.worldwide)) return false;
  }
  return true;
}

function matchSalary(job, filters) {
  const min = Number(filters.salaryMin);
  const max = Number(filters.salaryMax);
  const hasMin = !Number.isNaN(min) && filters.salaryMin !== "" && filters.salaryMin != null;
  const hasMax = !Number.isNaN(max) && filters.salaryMax !== "" && filters.salaryMax != null;
  if (!hasMin && !hasMax && (!filters.currency || filters.currency === "any")) return true;

  const info = job.salaryInfo || {};
  if (info.min == null && info.max == null) {
    return !filters.strictSalary; // soft include unknowns
  }
  if (filters.currency && filters.currency !== "any" && info.currency && info.currency !== filters.currency) {
    return false;
  }
  if (hasMin && info.max != null && info.max < min) return false;
  if (hasMin && info.max == null && info.min != null && info.min < min) return false;
  if (hasMax && info.min != null && info.min > max) return false;
  return true;
}

function matchSponsorship(job, sponsorship) {
  if (!sponsorship || sponsorship === "any") return true;
  if (job.sponsorship === "unknown") return !filters.strictEligibility;
  return job.sponsorship === sponsorship;
}

// placeholder for strict flags read from filters object in applyFilters
let filters = {};

function matchTimezone(job, timezone) {
  if (!timezone || timezone === "any") return true;
  if (!job.timezones?.length) return !filters.strictEligibility;
  return job.timezones.includes(timezone);
}

function matchEnglish(job, level) {
  if (!level || level === "any") return true;
  if (job.englishLevel === "unknown") return !filters.strictEligibility;
  const rank = { unknown: 0, required: 1, professional: 2, fluent: 3, native: 4 };
  return (rank[job.englishLevel] || 0) >= (rank[level] || 0);
}

function matchEmployerType(job, type) {
  if (!type || type === "any") return true;
  return job.employerType === type;
}

function matchCompanyStage(job, stage) {
  if (!stage || stage === "any") return true;
  if (job.companyStage === "unknown") return !filters.strictCompany;
  return job.companyStage === stage;
}

function matchCompanySize(job, size) {
  if (!size || size === "any") return true;
  if (job.companySize === "unknown") return !filters.strictCompany;
  return job.companySize === size;
}

function matchEasyApply(job, easyOnly) {
  if (!easyOnly) return true;
  return !!job.easyApply;
}

function matchIndustry(job, industry) {
  const terms = splitTerms(industry);
  if (!terms.length) return true;
  const blob = `${job.description} ${job.tags.join(" ")}`.toLowerCase();
  return includesAny(blob, terms);
}

/**
 * @param {object[]} jobs
 * @param {object} filtersIn
 */
export function applyFilters(jobs, filtersIn = {}) {
  filters = filtersIn;
  const titleInclude = splitTerms(filters.titleInclude);
  const titleExclude = splitTerms(filters.titleExclude);
  const descInclude = splitTerms(filters.descInclude);
  const descExclude = splitTerms(filters.descExclude);
  const exactPhrase = (filters.exactPhrase || "").trim().toLowerCase();

  return jobs.filter((job) => {
    const title = (job.title || "").toLowerCase();
    const desc = (job.description || "").toLowerCase();
    const blob = `${title} ${desc} ${job.tags.join(" ")}`;

    if (exactPhrase && !blob.includes(exactPhrase)) return false;
    if (!includesAll(title, titleInclude)) return false;
    if (!includesNone(title, titleExclude)) return false;
    if (!includesAll(desc, descInclude)) return false;
    if (!includesNone(desc, descExclude)) return false;
    if (!withinRecency(job.postedAt, filters.recency)) return false;
    if (!matchGeo(job, filters.geo)) return false;
    if (!matchJobType(job, filters.jobType)) return false;
    if (!matchWorkplace(job, filters.workplace)) return false;
    if (!matchEngagement(job, filters.engagement)) return false;
    if (!matchRemotePolicy(job, filters.remotePolicy)) return false;
    if (!matchLanguage(job, filters.language)) return false;
    if (!matchKeywords(job, filters.keywords)) return false;
    if (!matchSkills(job, filters.skillsMust, "all")) return false;
    if (!matchSkills(job, filters.skillsNice, "any")) return false;
    if (!matchSeniority(job, filters.seniority)) return false;
    if (!matchCompany(job, filters.company)) return false;
    if (!matchHiddenCompanies(job, filters.hiddenCompanies)) return false;
    if (!matchLocationText(job, filters.country, filters.state, filters.city)) return false;
    if (!matchSalary(job, filters)) return false;
    if (!matchSponsorship(job, filters.sponsorship)) return false;
    if (!matchTimezone(job, filters.timezone)) return false;
    if (!matchEnglish(job, filters.englishLevel)) return false;
    if (!matchEmployerType(job, filters.employerType)) return false;
    if (!matchCompanyStage(job, filters.companyStage)) return false;
    if (!matchCompanySize(job, filters.companySize)) return false;
    if (!matchEasyApply(job, filters.easyApply)) return false;
    if (!matchIndustry(job, filters.industry)) return false;
    // brazilOk is SOFT: remote/worldwide jobs usually accept BR unless country-restricted
    if (filters.brazilOk) {
      const restricted =
        job.remotePolicy === "country-restricted" ||
        job.remotePolicy === "emea-only" ||
        (job.geo?.us && !job.geo?.worldwide && !job.geo?.latamFriendly && job.workplace === "onsite");
      const ok =
        job.geo?.brazil ||
        job.geo?.latamFriendly ||
        job.remotePolicy === "brazil-ok" ||
        job.remotePolicy === "anywhere" ||
        job.geo?.worldwide ||
        job.workplace === "remote" ||
        job.workplace === "unknown";
      if (restricted || !ok) return false;
    }
    if (filters.latamOnly && !(job.geo?.latamFriendly || job.geo?.brazil)) return false;
    if (filters.noAgency && job.employerType === "agency") return false;
    if (filters.sources?.length && !filters.sources.includes(job.source)) return false;
    return true;
  });
}

export function sortJobs(jobs, sortBy = "recency") {
  const copy = [...jobs];
  switch (sortBy) {
    case "salary":
      copy.sort((a, b) => (b.salaryInfo?.max || b.salaryInfo?.min || 0) - (a.salaryInfo?.max || a.salaryInfo?.min || 0));
      break;
    case "company":
      copy.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
      break;
    case "hack-relevance":
      copy.sort((a, b) => {
        const ds = (b.hackScore || 0) - (a.hackScore || 0);
        if (ds) return ds;
        return (b.postedAt || 0) - (a.postedAt || 0);
      });
      break;
    case "relevance":
      copy.sort((a, b) => scoreRelevance(b) - scoreRelevance(a));
      break;
    case "recency":
    default:
      copy.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));
  }
  return copy;
}

function scoreRelevance(job) {
  let s = 0;
  if (job.postedAt) s += Math.min(50, (job.postedAt / Date.now()) * 50);
  if (job.geo?.latamFriendly || job.geo?.brazil) s += 20;
  if (job.geo?.worldwide) s += 10;
  if (job.salaryInfo?.min) s += 15;
  if (job.workplace === "remote") s += 10;
  if (job.easyApply) s += 5;
  return s;
}

export function defaultFilters() {
  return {
    keywords: ".NET, C#, React, TypeScript, DevOps, Python, Java, Node",
    exactPhrase: "",
    titleInclude: "",
    titleExclude: "",
    descInclude: "",
    descExclude: "",
    skillsMust: "",
    skillsNice: "",
    company: "",
    hiddenCompanies: "",
    industry: "",
    // any = don't drop dated ATS; sort still prefers recent
    recency: "any",
    geo: "latam",
    country: "any",
    state: "",
    city: "",
    workplace: "remote",
    remotePolicy: "any",
    timezone: "any",
    language: "any",
    englishLevel: "any",
    jobType: "any",
    engagement: "any",
    seniority: "any",
    salaryMin: "",
    salaryMax: "",
    currency: "any",
    payPeriod: "any",
    sponsorship: "any",
    employerType: "any",
    companyStage: "any",
    companySize: "any",
    easyApply: false,
    brazilOk: false,
    latamOnly: false,
    noAgency: false,
    strictSalary: false,
    strictEligibility: false,
    strictCompany: false,
    sortBy: "recency",
    market: "latam",
    applyHacks: true,
    sources: null,
  };
}

/** Market presets — set sensible defaults per region. */
export function marketPreset(market) {
  const base = defaultFilters();
  const presets = {
    brazil: {
      market: "brazil",
      geo: "brazil",
      country: "BR",
      workplace: "any",
      currency: "BRL",
      language: "any",
      engagement: "any",
      // Soft boost only — hard brazilOk drops most international remotes
      brazilOk: false,
      recency: "any",
    },
    us: {
      market: "us",
      geo: "us",
      country: "any",
      workplace: "remote",
      currency: "USD",
      language: "any",
      englishLevel: "any",
      sponsorship: "any",
      engagement: "any",
      recency: "any",
    },
    europe: {
      market: "europe",
      geo: "europe",
      country: "any",
      workplace: "remote",
      currency: "any",
      timezone: "any",
      language: "any",
      engagement: "any",
      recency: "any",
    },
    australia: {
      market: "australia",
      geo: "au-br",
      country: "any",
      workplace: "remote",
      currency: "any",
      timezone: "any",
      language: "any",
      englishLevel: "any",
      recency: "any",
    },
    worldwide: {
      market: "worldwide",
      geo: "worldwide",
      country: "remote",
      workplace: "remote",
      remotePolicy: "any",
      currency: "USD",
      brazilOk: false,
      recency: "any",
    },
    latam: {
      market: "latam",
      geo: "latam",
      workplace: "remote",
      remotePolicy: "any",
      // boost via hacks/ranking — do NOT hard-filter or we drop most remote boards
      brazilOk: false,
      currency: "USD",
      recency: "any",
    },
  };
  return { ...base, ...(presets[market] || presets.latam) };
}

export { splitTerms };
