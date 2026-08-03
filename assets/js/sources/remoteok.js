import { makeJob } from "../normalize.js";

export const id = "remoteok";
export const name = "RemoteOK";
export const weight = 1;

/** Pure normalizer for tests */
export function normalizeRemoteOk(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows
    .filter((r) => r && r.position && r.url)
    .map((r) =>
      makeJob({
        id: `remoteok:${r.id || r.slug || r.position}`,
        source: id,
        title: r.position,
        company: r.company || "Unknown",
        url: r.url?.startsWith("http") ? r.url : `https://remoteok.com/l/${r.id}`,
        description: r.description || "",
        location: r.location || "Worldwide",
        tags: Array.isArray(r.tags) ? r.tags : [],
        salary:
          r.salary_min || r.salary_max
            ? `$${r.salary_min || "?"}–$${r.salary_max || "?"}`
            : null,
        postedAt: r.date || r.epoch,
        raw: r,
      })
    );
}

export async function fetchJobs({ signal } = {}) {
  const res = await fetch("https://remoteok.com/api", {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`RemoteOK HTTP ${res.status}`);
  const data = await res.json();
  return normalizeRemoteOk(data);
}
