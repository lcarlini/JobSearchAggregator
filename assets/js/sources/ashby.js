import { makeJob } from "../normalize.js";

export const id = "ashby";
export const name = "Ashby Boards";
export const weight = 1.1;

const DEFAULT_BOARDS = ["Deel", "truelogic", "firstbaseio", "keyrock"];

export function normalizeAshby(payload, board) {
  const jobs = payload?.jobs || [];
  return jobs.map((j) =>
    makeJob({
      id: `ashby:${board}:${j.id || j.jobUrl}`,
      source: id,
      title: j.title,
      company: board,
      url: j.jobUrl || j.applyUrl,
      description: j.descriptionPlain || j.descriptionHtml || "",
      location:
        j.location ||
        (j.isRemote ? "Remote" : "") ||
        j.address?.postalAddress ||
        "",
      tags: j.department ? [j.department] : [],
      jobType: j.employmentType,
      postedAt: j.publishedAt || j.updatedAt,
      raw: j,
    })
  );
}

export async function fetchJobs({ signal, boards } = {}) {
  let list = boards;
  if (!list) {
    try {
      const res = await fetch("./data/companies.json", { signal });
      if (res.ok) {
        const data = await res.json();
        list = data.ashby || DEFAULT_BOARDS;
      }
    } catch {
      list = DEFAULT_BOARDS;
    }
  }
  list = list?.length ? list : DEFAULT_BOARDS;

  const results = await Promise.allSettled(
    list.map(async (board) => {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
      if (!res.ok) throw new Error(`${board}: HTTP ${res.status}`);
      return normalizeAshby(await res.json(), board);
    })
  );

  const jobs = [];
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
  }
  if (!jobs.length && results.every((r) => r.status === "rejected")) {
    throw new Error("All Ashby boards failed");
  }
  return jobs;
}
