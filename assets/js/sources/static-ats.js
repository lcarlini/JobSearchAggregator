import { makeJob } from "../normalize.js";

export const id = "static-ats";
export const name = "Company ATS";
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
      salary: j.salary || null,
      jobType: j.jobType,
      postedAt: j.postedAt,
      language: j.language,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("./data/ats-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`ATS static HTTP ${res.status}`);
  return normalizeStaticAts(await res.json());
}
