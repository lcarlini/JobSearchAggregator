/**
 * Apply Google/LinkedIn/Indeed-style hacks to widen & sharpen live search.
 * Returns enhanced filters, synonym expansions, API query variants, and external URLs.
 */

import { splitTerms } from "./filters.js";
import { buildSearchRecipes } from "./search-hacks.js";
import { buildDeepLinks } from "./sources/deeplinks.js";

const SYNONYMS = {
  ".net": [".net", "dotnet", "dotnet core", "asp.net", "csharp", "c#"],
  "c#": ["c#", "csharp", ".net", "dotnet"],
  csharp: ["c#", "csharp", ".net"],
  react: ["react", "react.js", "reactjs", "next.js", "nextjs"],
  typescript: ["typescript", "ts", "javascript", "js"],
  javascript: ["javascript", "js", "typescript", "node"],
  node: ["node", "nodejs", "node.js", "javascript"],
  python: ["python", "django", "fastapi", "flask"],
  java: ["java", "spring", "jvm", "kotlin"],
  devops: ["devops", "sre", "platform engineer", "kubernetes", "k8s", "ci/cd"],
  aws: ["aws", "amazon web services", "cloud"],
  azure: ["azure", "microsoft azure", "cloud"],
  "full stack": ["full stack", "fullstack", "full-stack"],
  fullstack: ["full stack", "fullstack", "full-stack"],
  backend: ["backend", "back-end", "back end", "server-side"],
  frontend: ["frontend", "front-end", "front end"],
};

const REMOTE_BOOST = [
  "remote",
  "remoto",
  "home office",
  "work from anywhere",
  "distributed",
];

const BR_BOOST = ["brazil", "brasil", "latam", "latin america", "brazil ok"];

/**
 * Expand a keyword list with synonyms (LinkedIn/Google OR style).
 */
export function expandKeywords(keywords) {
  const base = splitTerms(keywords);
  const out = new Set();
  for (const term of base) {
    out.add(term);
    const syns = SYNONYMS[term] || SYNONYMS[term.replace(/\s+/g, " ")];
    if (syns) syns.forEach((s) => out.add(s));
    // bare token without punctuation
    const bare = term.replace(/[^a-z0-9+#.]/gi, "");
    if (bare && SYNONYMS[bare]) SYNONYMS[bare].forEach((s) => out.add(s));
  }
  return [...out];
}

/**
 * Merge CSV-like filter fields uniquely.
 */
function mergeCsv(...parts) {
  const set = new Set();
  for (const p of parts) {
    for (const t of splitTerms(p)) set.add(t);
  }
  return [...set].join(", ");
}

/**
 * @param {object} filters
 * @returns {{ filters: object, applied: string[], apiQueries: object, external: object[], expandedKeywords: string[] }}
 */
function buildExternalLinks(filters, recipes = []) {
  const deep = buildDeepLinks(filters);
  const external = [];
  const push = (item) => {
    if (!item?.url || external.some((e) => e.url === item.url || e.id === item.id)) return;
    external.push(item);
  };

  // Consolidated platforms first — always mirror aggregator filters
  for (const id of [
    "linkedin",
    "indeed",
    "googlejobs",
    "glassdoor",
    "linkedin-br",
    "linkedin-under10",
    "indeed-br-remoto",
  ]) {
    const d = deep.find((x) => x.id === id);
    if (d) push({ id: d.id, name: d.name, titleKey: null, url: d.url, query: d.description });
  }
  for (const id of ["li-2h", "li-under10", "li-br-geoid", "li-boolean-jobs", "g-linkedin-jobs"]) {
    const r = recipes.find((x) => x.id === id);
    if (r) push({ id: r.id, name: r.platform, titleKey: r.titleKey, url: r.url, query: r.query });
  }
  for (const id of [
    "apinfo",
    "remotar",
    "gupy",
    "linkedin-ca",
    "indeed-ca",
    "indeed-nz",
    "linkedin-ae",
    "indeed-ae",
    "g-gupy",
    "g-indeed-br",
    "indeed-br",
    "apinfo-direct",
  ]) {
    const d = deep.find((x) => x.id === id);
    if (d) push({ id: d.id, name: d.name, titleKey: null, url: d.url, query: d.description });
    const r = recipes.find((x) => x.id === id);
    if (r) push({ id: r.id, name: r.platform, titleKey: r.titleKey, url: r.url, query: r.query });
  }
  return external;
}

export function applySearchHacks(filters = {}) {
  if (filters.applyHacks === false) {
    return {
      filters: { ...filters },
      applied: [],
      apiQueries: { remotiveSearches: [], remotiveCategories: ["software-dev"], jobicyTags: [] },
      // Always surface LinkedIn/Indeed even with hacks off — they are not scrapable
      external: buildExternalLinks(filters, []),
      expandedKeywords: splitTerms(filters.keywords),
    };
  }

  const applied = [];
  const enhanced = { ...filters, applyHacks: true };

  // 1) Synonym / OR expansion on keywords
  const expandedKeywords = expandKeywords(filters.keywords || "");
  if (expandedKeywords.length > splitTerms(filters.keywords).length) {
    applied.push("synonym-or");
  }
  enhanced.keywords = expandedKeywords.join(", ");
  enhanced._expandedKeywords = expandedKeywords;

  // 2) Seniority → exclude noise (LinkedIn/Indeed -junior -estágio)
  if (["senior", "senior+", "staff", "lead"].includes(filters.seniority)) {
    enhanced.titleExclude = mergeCsv(
      filters.titleExclude,
      "junior, jr, estágio, estagio, trainee, intern, internship"
    );
    enhanced.descExclude = mergeCsv(filters.descExclude, "university internship");
    applied.push("exclude-junior");
  }

  // 3) Remote modality → boost remote phrases in matching + exclude onsite-only noise
  if (!filters.workplace || filters.workplace === "remote" || filters.workplace === "any") {
    enhanced.descExclude = mergeCsv(
      enhanced.descExclude,
      filters.workplace === "remote" ? "on-site only, onsite only, must relocate" : ""
    );
    enhanced._remoteBoost = REMOTE_BOOST;
    applied.push("remote-boost");
  }

  // 4) Brazil / LATAM market → Google/LinkedIn style geo clauses as soft boosts
  if (
    filters.brazilOk ||
    filters.geo === "brazil" ||
    filters.geo === "latam" ||
    filters.market === "brazil" ||
    filters.market === "latam"
  ) {
    enhanced._geoBoost = BR_BOOST;
    // Never force hard brazilOk — ranking boost is enough (hard filter wiped results)
    applied.push("brazil-latam-boost");
  }

  // 5) Default workplace remote for IT international search when market is remote-ish
  if (
    (!filters.workplace || filters.workplace === "any") &&
    ["latam", "worldwide", "us", "europe", "australia"].includes(filters.market)
  ) {
    enhanced.workplace = "remote";
    applied.push("default-remote");
  }

  // 6) Sort: with hacks prefer relevance (boolean match quality)
  if (!filters.sortBy || filters.sortBy === "recency") {
    enhanced.sortBy = "hack-relevance";
    applied.push("sort-hack-relevance");
  }

  // 7) API multi-query variants (cast a wider net server-side)
  const primaryTags = expandedKeywords
    .map((k) => k.replace(/[^a-z0-9+#.]/gi, ""))
    .filter((k) => k.length >= 2)
    .slice(0, 6);

  const remotiveSearches = [
    ...new Set(
      [
        splitTerms(filters.keywords)[0],
        primaryTags.find((t) => /net|csharp|c#/i.test(t)),
        primaryTags.find((t) => /react|typescript|node/i.test(t)),
        primaryTags.find((t) => /python|java|devops/i.test(t)),
      ].filter(Boolean)
    ),
  ].slice(0, 4);

  const remotiveCategories = [
    "software-dev",
    "devops",
    "data",
  ];

  const jobicyTags = primaryTags
    .map((t) => t.replace(/^\./, ""))
    .filter(Boolean)
    .slice(0, 4);

  applied.push("multi-api-query");

  // 8) External boards — LinkedIn first, then Indeed/ApInfo/Google recipes
  const recipes = buildSearchRecipes(enhanced);
  const external = buildExternalLinks(enhanced, recipes);
  applied.push("external-hack-links");

  return {
    filters: enhanced,
    applied,
    apiQueries: { remotiveSearches, remotiveCategories, jobicyTags },
    external,
    expandedKeywords,
  };
}

/**
 * Score a job using hack boosts (synonyms, remote, BR/LATAM).
 */
export function hackScore(job, enhancedFilters, expandedKeywords = []) {
  let s = 0;
  const blob = `${job.title} ${job.company} ${job.tags?.join(" ") || ""} ${job.description}`.toLowerCase();

  for (const kw of expandedKeywords) {
    if (blob.includes(kw.toLowerCase())) s += 8;
  }
  // title matches weigh more (intitle: style)
  const title = (job.title || "").toLowerCase();
  for (const kw of expandedKeywords.slice(0, 12)) {
    if (title.includes(kw.toLowerCase())) s += 12;
  }

  for (const term of enhancedFilters._remoteBoost || []) {
    if (blob.includes(term)) s += 3;
  }
  for (const term of enhancedFilters._geoBoost || []) {
    if (blob.includes(term)) s += 6;
  }
  if (job.geo?.latamFriendly || job.geo?.brazil) s += 15;
  if (job.geo?.worldwide || job.remotePolicy === "anywhere") s += 8;
  if (job.workplace === "remote") s += 6;
  if (job.postedAt && Date.now() - job.postedAt < 86400000) s += 20;
  else if (job.postedAt && Date.now() - job.postedAt < 7 * 86400000) s += 10;
  if (job.salaryInfo?.min) s += 5;
  return s;
}
