import { cacheGet, cacheSet } from "./cache.js";
import { applyFilters, sortJobs } from "./filters.js";
import { dedupeJobs, hashFilters } from "./normalize.js";
import * as remoteok from "./sources/remoteok.js";
import * as remotive from "./sources/remotive.js";
import * as arbeitnow from "./sources/arbeitnow.js";
import * as jobicy from "./sources/jobicy.js";
import * as himalayas from "./sources/himalayas.js";
import * as themuse from "./sources/themuse.js";
import * as ashby from "./sources/ashby.js";
import * as staticAts from "./sources/static-ats.js";

export const ADAPTERS = [
  remoteok,
  remotive,
  arbeitnow,
  jobicy,
  himalayas,
  themuse,
  ashby,
  staticAts,
];

/**
 * Run all adapters in parallel with precise progress callbacks.
 * @param {object} filters
 * @param {(p: object) => void} onProgress
 * @param {string[] | null} enabledIds
 */
export async function searchJobs(filters, onProgress = () => {}, enabledIds = null) {
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
    });
  };

  emit();

  const tasks = adapters.map(async (adapter) => {
    const cacheKey = `source:${adapter.id}:v1`;
    const t0 = Date.now();
    sourceStatus[adapter.id].state = "running";
    emit();
    try {
      let jobs = await cacheGet(cacheKey);
      if (!jobs) {
        jobs = await adapter.fetchJobs();
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
  jobs = applyFilters(jobs, filters);
  jobs = sortJobs(jobs, filters.sortBy || "recency");

  const resultKey = `result:${hashFilters(filters)}`;
  await cacheSet(resultKey, jobs);

  onProgress({
    percent: 100,
    done: adapters.length,
    total: adapters.length,
    etaMs: 0,
    sources: { ...sourceStatus },
  });

  return {
    jobs,
    sources: sourceStatus,
    elapsedMs: Date.now() - startedAt,
  };
}

export { applyFilters, dedupeJobs };
