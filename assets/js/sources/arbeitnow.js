import { makeJob } from "../normalize.js";

export const id = "arbeitnow";
export const name = "Arbeitnow";
export const weight = 1.2;

export function normalizeArbeitnow(payload) {
  const data = payload?.data || payload || [];
  return (Array.isArray(data) ? data : []).map((j) =>
    makeJob({
      id: `arbeitnow:${j.slug || j.url}`,
      source: id,
      title: j.title,
      company: j.company_name || "Unknown",
      url: j.url,
      description: j.description || "",
      location: j.location || "Europe",
      tags: j.tags || [],
      jobType: j.job_types?.[0],
      postedAt: j.created_at,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
  return normalizeArbeitnow(await res.json());
}
