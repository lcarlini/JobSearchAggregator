import { makeJob } from "../normalize.js";

export const id = "apinfo";
export const name = "ApInfo";
export const weight = 1.2;

export function normalizeApinfo(payload) {
  const jobs = payload?.jobs || [];
  return jobs.map((j) =>
    makeJob({
      id: j.id || `apinfo:${j.title}`,
      source: id,
      title: j.title,
      company: j.company || "ApInfo",
      url: j.url,
      description: j.description || "",
      location: j.location || "Brasil",
      tags: [...(j.tags || []), "apinfo", "brazil"],
      salary: j.salary || null,
      jobType: j.jobType,
      postedAt: j.postedAt,
      language: j.language || "pt",
      workplace: j.workplace,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("./data/apinfo-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`ApInfo static HTTP ${res.status}`);
  return normalizeApinfo(await res.json());
}
