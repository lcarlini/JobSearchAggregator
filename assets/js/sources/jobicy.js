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

export async function fetchJobs({ signal, count = 50 } = {}) {
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Jobicy HTTP ${res.status}`);
  return normalizeJobicy(await res.json());
}
