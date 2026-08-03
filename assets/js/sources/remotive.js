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

async function fetchOne(url, signal) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Remotive HTTP ${res.status}`);
  return normalizeRemotive(await res.json());
}

/**
 * With hacks: multiple categories + search terms in parallel.
 */
export async function fetchJobs({
  signal,
  category = "software-dev",
  categories,
  searches,
} = {}) {
  const cats = categories?.length ? categories : [category];
  const urls = new Set();

  for (const cat of cats) {
    urls.add(
      `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(cat)}`
    );
  }
  for (const q of searches || []) {
    if (!q) continue;
    urls.add(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}`
    );
  }

  const results = await Promise.allSettled(
    [...urls].map((url) => fetchOne(url, signal))
  );
  const jobs = [];
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
  }
  if (!jobs.length && results.every((r) => r.status === "rejected")) {
    throw new Error(results[0].reason?.message || "Remotive failed");
  }
  return jobs;
}
