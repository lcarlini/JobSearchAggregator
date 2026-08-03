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

export async function fetchJobs({ signal, limit = 20, query = "" } = {}) {
  // Live API often fails CORS in the browser — fall back to Action-refreshed JSON
  try {
    const urls = [
      `https://himalayas.app/jobs/api?limit=${limit}`,
      // Search API: keyword + Brazil / worldwide (docs: himalayas.app/api)
      `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query || "software engineer")}&worldwide=true&page=1`,
      `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query || "developer")}&country=Brazil&page=1`,
    ];
    const batches = await Promise.allSettled(
      urls.map(async (url) => {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal,
        });
        if (!res.ok) throw new Error(`Himalayas HTTP ${res.status}`);
        return normalizeHimalayas(await res.json());
      })
    );
    const seen = new Set();
    const jobs = [];
    for (const r of batches) {
      if (r.status !== "fulfilled") continue;
      for (const j of r.value) {
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        jobs.push(j);
      }
    }
    if (jobs.length) return jobs;
  } catch {
    /* use static */
  }
  return fetchStatic({ signal });
}
