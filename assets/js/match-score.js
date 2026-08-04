/** Indeed/LinkedIn-style fit score from current filters vs job text. */

function terms(value) {
  return String(value || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1);
}

/**
 * @returns {{ score: number, hits: string[], total: number }}
 */
export function computeMatchScore(job, filters = {}) {
  const blob = `${job.title || ""} ${job.company || ""} ${job.location || ""} ${(job.tags || []).join(" ")} ${job.description || ""}`.toLowerCase();
  const wanted = [
    ...terms(filters.keywords),
    ...terms(filters.skillsMust),
    ...terms(filters.skillsNice),
    ...terms(filters.titleInclude),
    ...terms(filters.exactPhrase),
  ];
  // Deduplicate while keeping order
  const uniq = [...new Set(wanted)].slice(0, 16);
  if (!uniq.length) {
    let soft = 40;
    if (job.workplace === "remote") soft += 10;
    if (job.geo?.worldwide || job.remoteScope === "worldwide") soft += 10;
    if (job.salary) soft += 8;
    if (job.geo?.latamFriendly || job.geo?.brazil) soft += 8;
    return { score: Math.min(99, soft), hits: [], total: 0 };
  }

  const hits = uniq.filter((term) => blob.includes(term));
  let score = Math.round((hits.length / uniq.length) * 100);

  // Soft bonuses inspired by LinkedIn "top applicant" signals
  if (job.workplace === "remote" && String(filters.workplace || "").includes("remote")) score += 4;
  if (filters.brazilOk && (job.geo?.brazil || job.geo?.latamFriendly || job.remoteScope === "worldwide")) {
    score += 4;
  }
  if (job.salary) score += 3;
  if (job.postedAt && Date.now() - job.postedAt < 48 * 3600 * 1000) score += 3;

  return {
    score: Math.max(0, Math.min(100, score)),
    hits,
    total: uniq.length,
  };
}

export function matchTier(score) {
  if (score >= 80) return "high";
  if (score >= 55) return "mid";
  return "low";
}

export function isFreshJob(job, hours = 48) {
  if (!job?.postedAt) return false;
  return Date.now() - job.postedAt <= hours * 3600 * 1000;
}
