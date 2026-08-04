import { makeJob } from "../normalize.js";

export const id = "static-ats";
export const name = "Company ATS (cache)";
export const weight = 1.3;

export function normalizeStaticAts(payload) {
  const jobs = payload?.jobs || [];
  return jobs.map((j) =>
    makeJob({
      id: j.id || `ats:${j.source}:${j.title}:${j.company}`,
      source: id,
      title: j.title,
      company: j.company,
      url: j.url,
      description: j.description || "",
      location: j.location || "Remote",
      tags: [...(j.tags || []), j.ats].filter(Boolean),
      salary: j.salary || j.compensation || null,
      jobType: j.jobType,
      postedAt: j.postedAt,
      language: j.language,
      raw: j,
    })
  );
}

async function loadBoardCounts(signal) {
  try {
    const res = await fetch("./data/companies.json", { signal });
    if (!res.ok) return null;
    const c = await res.json();
    const keys = [
      "greenhouse",
      "lever",
      "ashby",
      "workable",
      "smartrecruiters",
      "recruitee",
      "breezy",
      "bamboohr",
      "personio",
      "workday",
    ];
    let boards = 0;
    const byType = {};
    for (const k of keys) {
      const n = (c[k] || []).length;
      byType[k] = n;
      boards += n;
    }
    return { boards, byType };
  } catch {
    return null;
  }
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("./data/ats-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`ATS static HTTP ${res.status}`);
  const data = await res.json();
  const jobs = normalizeStaticAts(data);
  const boardInfo = await loadBoardCounts(signal);
  // Array property read by search-engine progress UI
  jobs.coverage = {
    mode: "cache",
    jobsInCache: data.count || jobs.length,
    byAts: data.byAts || {},
    boards: boardInfo?.boards || null,
    boardTypes: boardInfo?.byType || null,
    generatedAt: data.generatedAt || null,
  };
  return jobs;
}
