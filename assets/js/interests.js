/** Persistência local da lista de interesses (vagas salvas) + status de candidatura. */

const KEY = "jsa-interests";
const LEGACY_KEY = "jsa-saved";

export const INTEREST_STATUSES = ["saved", "applied", "interview", "offer", "rejected"];

function compactJob(job) {
  return {
    id: job.id || job.url,
    url: job.url,
    title: job.title || "",
    company: job.company || "",
    source: job.source || "",
    location: job.location || "",
    description: (job.description || "").slice(0, 800),
    salary: job.salary || null,
    workplace: job.workplace || "unknown",
    jobType: job.jobType || "unknown",
    remoteScope: job.remoteScope || "unknown",
    postedAt: job.postedAt || null,
    geo: job.geo || null,
    savedAt: job.savedAt || Date.now(),
    status: INTEREST_STATUSES.includes(job.status) ? job.status : "saved",
    notes: typeof job.notes === "string" ? job.notes.slice(0, 500) : "",
  };
}

function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const urls = JSON.parse(raw);
    if (!Array.isArray(urls) || !urls.length) return [];
    return urls
      .filter((u) => typeof u === "string" && u.startsWith("http"))
      .map((url) =>
        compactJob({
          url,
          title: url,
          company: "",
          source: "saved",
          description: "",
          savedAt: Date.now(),
        })
      );
  } catch {
    return [];
  }
}

export function loadInterests() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.filter((j) => j?.url).map(compactJob);
    }
  } catch {
    /* fall through */
  }
  const migrated = migrateLegacy();
  if (migrated.length) saveInterests(migrated);
  return migrated;
}

export function saveInterests(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function interestKey(jobOrUrl) {
  return typeof jobOrUrl === "string" ? jobOrUrl : jobOrUrl?.url || "";
}

export function hasInterest(list, jobOrUrl) {
  const key = interestKey(jobOrUrl);
  return list.some((j) => j.url === key);
}

export function getInterest(list, jobOrUrl) {
  const key = interestKey(jobOrUrl);
  return list.find((j) => j.url === key) || null;
}

export function toggleInterest(list, job) {
  const key = interestKey(job);
  if (!key) return { list, added: false };
  const idx = list.findIndex((j) => j.url === key);
  if (idx >= 0) {
    const next = list.slice(0, idx).concat(list.slice(idx + 1));
    saveInterests(next);
    return { list: next, added: false };
  }
  const next = [compactJob(job), ...list];
  saveInterests(next);
  return { list: next, added: true };
}

/** Add once by URL — never duplicates an already-saved job. */
export function addInterest(list, job) {
  const key = interestKey(job);
  if (!key) return { list, added: false, already: false };
  if (list.some((j) => j.url === key)) {
    return { list, added: false, already: true };
  }
  const next = [compactJob(job), ...list];
  saveInterests(next);
  return { list: next, added: true, already: false };
}

export function updateInterest(list, url, patch) {
  const next = list.map((j) => {
    if (j.url !== url) return j;
    return compactJob({ ...j, ...patch, url: j.url });
  });
  saveInterests(next);
  return next;
}

export function removeInterest(list, url) {
  const next = list.filter((j) => j.url !== url);
  saveInterests(next);
  return next;
}

export function clearInterests() {
  saveInterests([]);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return [];
}
