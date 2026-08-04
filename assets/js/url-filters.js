/** Shareable search URLs (Indeed/LinkedIn-style saved search). */

const KEYS = [
  "keywords",
  "geo",
  "workplace",
  "remoteScope",
  "seniority",
  "jobType",
  "recency",
  "sortBy",
  "salaryMin",
  "language",
  "remotePolicy",
  "skillsMust",
  "titleInclude",
  "titleExclude",
  "company",
];

const BOOLS = ["brazilOk", "latamOnly", "noAgency", "easyApply", "applyHacks", "strictSalary"];

export function filtersToSearchParams(filters = {}) {
  const p = new URLSearchParams();
  for (const k of KEYS) {
    const v = filters[k];
    if (v == null || v === "" || v === "any") continue;
    p.set(k, String(v));
  }
  for (const k of BOOLS) {
    if (filters[k]) p.set(k, "1");
  }
  return p;
}

export function searchParamsToFilters(params = new URLSearchParams(location.search)) {
  const out = {};
  for (const k of KEYS) {
    if (params.has(k)) out[k] = params.get(k);
  }
  for (const k of BOOLS) {
    if (params.has(k)) out[k] = params.get(k) === "1" || params.get(k) === "true";
  }
  return out;
}

export function writeFiltersToUrl(filters) {
  const p = filtersToSearchParams(filters);
  const qs = p.toString();
  const next = qs ? `${location.pathname}?${qs}${location.hash}` : `${location.pathname}${location.hash}`;
  history.replaceState(null, "", next);
}

export function shareUrl(filters) {
  const p = filtersToSearchParams(filters);
  const url = `${location.origin}${location.pathname}?${p.toString()}`;
  return url;
}
