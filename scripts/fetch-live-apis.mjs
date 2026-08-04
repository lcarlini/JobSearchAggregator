#!/usr/bin/env node
/**
 * Server-side fetch for APIs that fail CORS in the browser.
 * Writes data/himalayas-jobs.json + data/themuse-jobs.json for static adapters.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (compatible; JobSearchAggregator/1.0; +https://github.com/lcarlini/JobSearchAggregator)";

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

function write(name, payload) {
  const out = path.join(root, "data", name);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${payload.count ?? payload.jobs?.length ?? "?"} → data/${name}`);
}

// —— Himalayas (browse pagination + stack searches) ——
const himalayasJobs = [];
const himalayasSeen = new Set();
function pushHimalayas(batch) {
  for (const j of batch || []) {
    const id = String(j.id || j.slug || j.guid || j.url || "");
    if (!id || himalayasSeen.has(id)) continue;
    himalayasSeen.add(id);
    himalayasJobs.push(j);
  }
}
try {
  let offset = 0;
  const limit = 20;
  for (let i = 0; i < 50; i++) {
    const data = await getJson(
      `https://himalayas.app/jobs/api?limit=${limit}&offset=${offset}`
    );
    const batch = data.jobs || [];
    console.log(`Himalayas offset=${offset} → ${batch.length} (total ${data.totalCount ?? "?"})`);
    if (!batch.length) break;
    pushHimalayas(batch);
    offset += batch.length;
    if (batch.length < limit) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // Targeted searches for stacks that browse feed often under-represents
  for (const q of [".NET", "C#", "Azure", "React", "TypeScript", "DevOps", "Python"]) {
    try {
      const data = await getJson(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&sort=recent&page=1`
      );
      const batch = data.jobs || data.results || [];
      console.log(`Himalayas search "${q}" → ${batch.length}`);
      pushHimalayas(batch);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.warn(`Himalayas search "${q}" failed:`, e.message);
    }
  }
  write("himalayas-jobs.json", {
    generatedAt: new Date().toISOString(),
    count: himalayasJobs.length,
    jobs: himalayasJobs,
  });
} catch (e) {
  console.warn("Himalayas failed:", e.message);
  if (!fs.existsSync(path.join(root, "data", "himalayas-jobs.json"))) {
    write("himalayas-jobs.json", { generatedAt: new Date().toISOString(), count: 0, jobs: [] });
  }
}

// —— The Muse (software / data / IT, several pages) ——
const museJobs = [];
const cats = ["Software Engineering", "Data Science", "IT", "Design and UX"];
try {
  for (const category of cats) {
    for (let page = 0; page < 5; page++) {
      const q = encodeURIComponent(category);
      const data = await getJson(
        `https://www.themuse.com/api/public/jobs?category=${q}&page=${page}`
      );
      const batch = data.results || [];
      console.log(`The Muse ${category} p${page} → ${batch.length}`);
      museJobs.push(...batch);
      if (!batch.length || page + 1 >= (data.page_count || 1)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const seen = new Set();
  const unique = [];
  for (const j of museJobs) {
    const id = String(j.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(j);
  }
  write("themuse-jobs.json", {
    generatedAt: new Date().toISOString(),
    count: unique.length,
    jobs: unique,
  });
} catch (e) {
  console.warn("The Muse failed:", e.message);
  if (!fs.existsSync(path.join(root, "data", "themuse-jobs.json"))) {
    write("themuse-jobs.json", { generatedAt: new Date().toISOString(), count: 0, jobs: [] });
  }
}

// —— RemoteJobs.org (free public API) ——
try {
  const cats = ["programming", "devops", "data-science"];
  const all = [];
  for (const category of cats) {
    const data = await getJson(
      `https://remotejobs.org/api/v1/jobs?category=${category}&limit=50&type=full-time`
    );
    const batch = data.data || [];
    console.log(`RemoteJobs.org ${category} → ${batch.length}`);
    all.push(...batch);
  }
  const seen = new Set();
  const jobs = [];
  for (const j of all) {
    const id = String(j.id || j.url);
    if (seen.has(id)) continue;
    seen.add(id);
    jobs.push(j);
  }
  write("remotejobsorg-jobs.json", {
    generatedAt: new Date().toISOString(),
    count: jobs.length,
    data: jobs,
  });
} catch (e) {
  console.warn("RemoteJobs.org failed:", e.message);
  if (!fs.existsSync(path.join(root, "data", "remotejobsorg-jobs.json"))) {
    write("remotejobsorg-jobs.json", {
      generatedAt: new Date().toISOString(),
      count: 0,
      data: [],
    });
  }
}
