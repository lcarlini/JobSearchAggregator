import { makeJob } from "../normalize.js";

export const id = "themuse";
export const name = "The Muse";
export const weight = 0.9;

export function normalizeTheMuse(payload) {
  const results = payload?.results || [];
  return results.map((j) =>
    makeJob({
      id: `themuse:${j.id}`,
      source: id,
      title: j.name,
      company: j.company?.name || "Unknown",
      url: j.refs?.landing_page || j.refs?.external || "#",
      description: j.contents || "",
      location: (j.locations || []).map((l) => l.name).join(", ") || "Remote",
      tags: (j.categories || []).map((c) => c.name),
      jobType: (j.levels || []).map((l) => l.name).join(" "),
      postedAt: j.publication_date,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal, page = 0 } = {}) {
  const cats = [
    "Software%20Engineering",
    "Data%20Science",
    "IT",
  ];
  const jobs = [];
  for (const category of cats) {
    const url = `https://www.themuse.com/api/public/jobs?category=${category}&page=${page}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    if (!res.ok) throw new Error(`The Muse HTTP ${res.status}`);
    jobs.push(...normalizeTheMuse(await res.json()));
  }
  return jobs;
}
