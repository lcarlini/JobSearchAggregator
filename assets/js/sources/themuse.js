import { makeJob } from "../normalize.js";

export const id = "themuse";
export const name = "The Muse";
export const weight = 0.9;

export function normalizeTheMuse(payload) {
  const results = payload?.results || payload?.jobs || [];
  return results.map((j) =>
    makeJob({
      id: `themuse:${j.id}`,
      source: id,
      title: j.name || j.title,
      company: j.company?.name || j.company || "Unknown",
      url: j.refs?.landing_page || j.refs?.external || j.url || "#",
      description: j.contents || j.description || "",
      location: (j.locations || []).map((l) => l.name || l).join(", ") || "Remote",
      tags: (j.categories || []).map((c) => c.name || c),
      jobType: (j.levels || []).map((l) => l.name || l).join(" "),
      postedAt: j.publication_date || j.postedAt,
      raw: j,
    })
  );
}

async function fetchStatic({ signal } = {}) {
  const res = await fetch("./data/themuse-jobs.json", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`The Muse static HTTP ${res.status}`);
  return normalizeTheMuse(await res.json());
}

export async function fetchJobs({ signal, page = 0 } = {}) {
  try {
    const cats = ["Software%20Engineering", "Data%20Science", "IT"];
    const jobs = [];
    for (const category of cats) {
      const url = `https://www.themuse.com/api/public/jobs?category=${category}&page=${page}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!res.ok) throw new Error(`The Muse HTTP ${res.status}`);
      jobs.push(...normalizeTheMuse(await res.json()));
    }
    if (jobs.length) return jobs;
  } catch {
    /* use static */
  }
  return fetchStatic({ signal });
}
