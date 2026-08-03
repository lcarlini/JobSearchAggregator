import { cacheGet, cacheSet } from "./cache.js";
import { applyFilters, sortJobs } from "./filters.js";
import { dedupeJobs, hashFilters } from "./normalize.js";
import { applySearchHacks, hackScore } from "./apply-hacks.js";
import * as remoteok from "./sources/remoteok.js";
import * as remotive from "./sources/remotive.js";
import * as arbeitnow from "./sources/arbeitnow.js";
import * as jobicy from "./sources/jobicy.js";
import * as himalayas from "./sources/himalayas.js";
import * as themuse from "./sources/themuse.js";
import * as ashby from "./sources/ashby.js";
import * as staticAts from "./sources/static-ats.js";
import * as apinfo from "./sources/apinfo.js";

export const ADAPTERS = [
  remoteok,
  remotive,
  arbeitnow,
  jobicy,
  himalayas,
  themuse,
  ashby,
  staticAts,
  apinfo,
];

/**
 * Run all adapters in parallel with precise progress callbacks.
 * Applies search hacks (synonyms, multi-query, exclude junior, BR boost…) when enabled.
 */
export async function searchJobs(filters, onProgress = () => {}, enabledIds = null) {
  const hacked = applySearchHacks(filters);
  const effective = hacked.filters;
  const apiQ = hacked.apiQueries;

  const adapters = ADAPTERS.filter(
    (a) => !enabledIds || enabledIds.includes(a.id)
  );
  const totalWeight = adapters.reduce((s, a) => s + (a.weight || 1), 0);
  const startedAt = Date.now();
  const sourceStatus = Object.fromEntries(
    adapters.map((a) => [
      a.id,
      { id: a.id, name: a.name, state: "pending", count: 0, error: null, ms: 0 },
    ])
  );

  let completedWeight = 0;
  const emit = () => {
    const done = Object.values(sourceStatus).filter((s) =>
      ["ok", "empty", "error"].includes(s.state)
    ).length;
    const pct = Math.min(99, Math.round((completedWeight / totalWeight) * 100));
    const elapsed = Date.now() - startedAt;
    const rate = done ? elapsed / done : 0;
    const eta = Math.max(0, Math.round(rate * (adapters.length - done)));
    onProgress({
      percent: pct,
      done,
      total: adapters.length,
      etaMs: eta,
      sources: { ...sourceStatus },
      hacks: hacked.applied,
    });
  };

  emit();

  const fetchOpts = (adapterId) => {
    if (adapterId === "remotive") {
      return {
        categories: apiQ.remotiveCategories,
        searches: apiQ.remotiveSearches,
      };
    }
    if (adapterId === "jobicy") {
      return { tags: apiQ.jobicyTags };
    }
    return {};
  };

  // Bust cache when hacks change query shape
  const hackKey = hacked.applied.length ? `:hacks:${hacked.applied.join("+")}` : "";

  const tasks = adapters.map(async (adapter) => {
    // v3: bust caches that may hold pre-sanitize / bad-encoding rows
    const cacheKey = `source:${adapter.id}:v3${hackKey}:${(apiQ.remotiveSearches || []).join(",")}`;
    const t0 = Date.now();
    sourceStatus[adapter.id].state = "running";
    emit();
    try {
      let jobs = await cacheGet(cacheKey);
      if (!jobs) {
        jobs = await adapter.fetchJobs(fetchOpts(adapter.id));
        await cacheSet(cacheKey, jobs);
      }
      const ms = Date.now() - t0;
      sourceStatus[adapter.id] = {
        id: adapter.id,
        name: adapter.name,
        state: jobs.length ? "ok" : "empty",
        count: jobs.length,
        error: null,
        ms,
      };
      completedWeight += adapter.weight || 1;
      emit();
      return jobs;
    } catch (err) {
      const ms = Date.now() - t0;
      sourceStatus[adapter.id] = {
        id: adapter.id,
        name: adapter.name,
        state: "error",
        count: 0,
        error: err?.message || String(err),
        ms,
      };
      completedWeight += adapter.weight || 1;
      emit();
      return [];
    }
  });

  const batches = await Promise.all(tasks);
  let jobs = dedupeJobs(batches.flat());
  jobs = applyFilters(jobs, effective);

  // Attach hack scores for ranking
  for (const job of jobs) {
    job.hackScore = hackScore(job, effective, hacked.expandedKeywords);
  }
  jobs = sortJobs(jobs, effective.sortBy || "recency");

  const resultKey = `result:${hashFilters(effective)}`;
  await cacheSet(resultKey, jobs);

  onProgress({
    percent: 100,
    done: adapters.length,
    total: adapters.length,
    etaMs: 0,
    sources: { ...sourceStatus },
    hacks: hacked.applied,
  });

  return {
    jobs,
    sources: sourceStatus,
    elapsedMs: Date.now() - startedAt,
    hacksApplied: hacked.applied,
    externalHacks: hacked.external,
    expandedKeywords: hacked.expandedKeywords,
    effectiveFilters: effective,
  };
}

export { applyFilters, dedupeJobs };
