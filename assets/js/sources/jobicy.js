import { makeJob } from "../normalize.js";

export const id = "jobicy";
export const name = "Jobicy";
export const weight = 0.8;

export function normalizeJobicy(payload) {
  const jobs = payload?.jobs || [];
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    makeJob({
      id: `jobicy:${j.id}`,
      source: id,
      title: j.jobTitle,
      company: j.companyName || "Unknown",
      url: j.url,
      description: j.jobDescription || j.jobExcerpt || "",
      location: j.jobGeo || "Worldwide",
      tags: [].concat(j.jobIndustry || [], j.jobType || []).flat(),
      salary:
        j.annualSalaryMin || j.annualSalaryMax
          ? `${j.salaryCurrency || ""} ${j.annualSalaryMin || "?"}–${j.annualSalaryMax || "?"}`.trim()
          : null,
      jobType: String(j.jobType || "").toLowerCase().includes("full")
        ? "full-time"
        : String(j.jobType || "").toLowerCase().includes("contract")
          ? "freelance"
          : undefined,
      postedAt: j.pubDate,
      raw: j,
    })
  );
}

async function fetchOne(url, signal) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Jobicy HTTP ${res.status}`);
  return normalizeJobicy(await res.json());
}

export async function fetchJobs({ signal, count = 50, tags } = {}) {
  const urls = new Set([
    `https://jobicy.com/api/v2/remote-jobs?count=${count}`,
  ]);
  for (const tag of (tags || []).slice(0, 4)) {
    urls.add(
      `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${encodeURIComponent(tag)}`
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
    throw new Error(results[0].reason?.message || "Jobicy failed");
  }
  return jobs;
}
