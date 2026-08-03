import { makeJob } from "../normalize.js";

export const id = "himalayas";
export const name = "Himalayas";
export const weight = 0.9;

export function normalizeHimalayas(payload) {
  const jobs = payload?.jobs || payload || [];
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    makeJob({
      id: `himalayas:${j.id || j.slug || j.title}`,
      source: id,
      title: j.title,
      company: j.companyName || j.company || "Unknown",
      url: j.applicationLink || j.url || `https://himalayas.app/jobs/${j.slug || ""}`,
      description: j.description || j.excerpt || "",
      location:
        (j.locationRestrictions || []).join(", ") ||
        j.timezoneRestrictions?.join(", ") ||
        "Worldwide",
      tags: j.categories || j.skills || [],
      salary:
        j.minSalary || j.maxSalary
          ? `$${j.minSalary || "?"}–$${j.maxSalary || "?"}`
          : null,
      postedAt: j.pubDate || j.createdAt || j.publishedAt,
      raw: j,
    })
  );
}

async function fetchStatic({ signal } = {}) {
  const res = await fetch("./data/himalayas-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Himalayas static HTTP ${res.status}`);
  return normalizeHimalayas(await res.json());
}

export async function fetchJobs({ signal, limit = 100 } = {}) {
  // Live API often fails CORS in the browser — fall back to Action-refreshed JSON
  try {
    const url = `https://himalayas.app/jobs/api?limit=${limit}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`Himalayas HTTP ${res.status}`);
    const jobs = normalizeHimalayas(await res.json());
    if (jobs.length) return jobs;
  } catch {
    /* use static */
  }
  return fetchStatic({ signal });
}
