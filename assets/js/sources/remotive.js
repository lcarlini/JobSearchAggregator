import { makeJob } from "../normalize.js";

export const id = "remotive";
export const name = "Remotive";
export const weight = 1;

export function normalizeRemotive(payload) {
  const jobs = payload?.jobs || payload || [];
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    makeJob({
      id: `remotive:${j.id}`,
      source: id,
      title: j.title,
      company: j.company_name || "Unknown",
      url: j.url || j.job_url,
      description: j.description || "",
      location: j.candidate_required_location || "Worldwide",
      tags: j.tags || [],
      salary: j.salary || null,
      jobType: (j.job_type || "").toLowerCase().includes("full")
        ? "full-time"
        : (j.job_type || "").toLowerCase().includes("contract")
          ? "freelance"
          : undefined,
      postedAt: j.publication_date,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal, category = "software-dev" } = {}) {
  const url = `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Remotive HTTP ${res.status}`);
  return normalizeRemotive(await res.json());
}
