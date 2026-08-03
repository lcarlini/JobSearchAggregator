import { makeJob } from "../normalize.js";

export const id = "remotejobsorg";
export const name = "RemoteJobs.org";
export const weight = 0.85;

export function normalizeRemoteJobsOrg(payload) {
  const jobs = payload?.data || payload?.jobs || [];
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    makeJob({
      id: `remotejobsorg:${j.id || j.slug || j.url}`,
      source: id,
      title: j.title,
      company: j.company?.name || j.company || "Unknown",
      url: j.url || j.apply_url || j.link || "#",
      description: j.description || j.excerpt || "",
      location: j.location || "Remote",
      tags: [j.category, j.type].filter(Boolean),
      jobType: j.type,
      postedAt: j.published_at || j.created_at || j.postedAt,
      raw: j,
    })
  );
}

async function fetchStatic({ signal } = {}) {
  const res = await fetch("./data/remotejobsorg-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`RemoteJobs.org static HTTP ${res.status}`);
  return normalizeRemoteJobsOrg(await res.json());
}

export async function fetchJobs({ signal, limit = 50 } = {}) {
  const cats = ["programming", "devops", "data-science"];
  try {
    const batches = await Promise.all(
      cats.map(async (category) => {
        const url = `https://remotejobs.org/api/v1/jobs?category=${category}&limit=${limit}&type=full-time`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal,
        });
        if (!res.ok) throw new Error(`RemoteJobs.org HTTP ${res.status}`);
        return normalizeRemoteJobsOrg(await res.json());
      })
    );
    const jobs = batches.flat();
    if (jobs.length) return jobs;
  } catch {
    /* static fallback */
  }
  return fetchStatic({ signal });
}
