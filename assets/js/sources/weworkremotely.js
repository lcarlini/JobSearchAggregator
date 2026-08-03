import { makeJob } from "../normalize.js";

export const id = "weworkremotely";
export const name = "We Work Remotely";
export const weight = 1.0;

export function normalizeWeWorkRemotely(payload) {
  const jobs = payload?.jobs || [];
  return (Array.isArray(jobs) ? jobs : []).map((j) =>
    makeJob({
      id: j.id || `weworkremotely:${j.url}`,
      source: id,
      title: j.title,
      company: j.company || "Unknown",
      url: j.url || "#",
      description: j.description || "",
      location: j.location || j.region || "Remote",
      tags: j.tags || [j.category].filter(Boolean),
      postedAt: j.postedAt || j.pubDate || null,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("./data/weworkremotely-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`We Work Remotely static HTTP ${res.status}`);
  return normalizeWeWorkRemotely(await res.json());
}
