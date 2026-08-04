import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyFilters, defaultFilters, marketPreset } from "../assets/js/filters.js";
import { applySearchHacks } from "../assets/js/apply-hacks.js";
import { dedupeJobs } from "../assets/js/normalize.js";
import { ADAPTERS } from "../assets/js/search-engine.js";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { normalizeApinfo } from "../assets/js/sources/apinfo.js";
import { normalizeHimalayas } from "../assets/js/sources/himalayas.js";
import { normalizeTheMuse } from "../assets/js/sources/themuse.js";
import { normalizeWeWorkRemotely } from "../assets/js/sources/weworkremotely.js";
import { buildDeepLinks } from "../assets/js/sources/deeplinks.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { jobs: [] };
};

describe("search engine coverage", () => {
  const ats = normalizeStaticAts(load("data/ats-jobs.json"));
  const apinfo = normalizeApinfo(load("data/apinfo-jobs.json"));
  const hima = normalizeHimalayas(load("data/himalayas-jobs.json"));
  const muse = normalizeTheMuse(load("data/themuse-jobs.json"));
  const wwr = normalizeWeWorkRemotely(load("data/weworkremotely-jobs.json"));
  const pool = dedupeJobs([...ats, ...apinfo, ...hima, ...muse, ...wwr]);

  it("registers all expected adapters including ApInfo", () => {
    const ids = ADAPTERS.map((a) => a.id);
    for (const id of [
      "remoteok",
      "remotive",
      "arbeitnow",
      "jobicy",
      "himalayas",
      "themuse",
      "ashby",
      "static-ats",
      "apinfo",
      "remotejobsorg",
      "weworkremotely",
    ]) {
      assert.ok(ids.includes(id), `missing adapter ${id}`);
    }
  });

  it("static pool is large enough to search", () => {
    assert.ok(ats.length >= 500, `ATS too small: ${ats.length}`);
    assert.ok(apinfo.length >= 50, `ApInfo too small: ${apinfo.length}`);
    assert.ok(pool.length >= 500);
  });

  it("default LATAM search returns many more than the old 3-job bug", () => {
    const filters = { ...defaultFilters(), keywords: ".NET, C#", applyHacks: true };
    const hacked = applySearchHacks(filters);
    const out = applyFilters(pool, hacked.filters);
    assert.ok(out.length >= 20, `expected >=20 .NET jobs, got ${out.length}`);
    assert.ok(out.some((j) => j.source === "apinfo"), "ApInfo should contribute");
  });

  it("old hard filters collapse results (regression guard)", () => {
    const out = applyFilters(pool, {
      ...defaultFilters(),
      keywords: ".NET, C#",
      brazilOk: true,
      recency: "3d",
      seniority: "senior+",
      workplace: "remote",
      geo: "latam",
      applyHacks: false,
    });
    assert.ok(out.length < 30, `old filters should be strict, got ${out.length}`);
  });

  it("Europe/US presets are soft enough to return jobs", () => {
    const eu = applyFilters(
      pool,
      applySearchHacks({ ...marketPreset("europe"), keywords: ".NET, Java", applyHacks: true }).filters
    );
    const us = applyFilters(
      pool,
      applySearchHacks({ ...marketPreset("us"), keywords: ".NET", applyHacks: true }).filters
    );
    assert.ok(eu.length >= 5, `europe too empty: ${eu.length}`);
    assert.ok(us.length >= 5, `us too empty: ${us.length}`);
  });

  it("Brazil + remote soft geo returns multi-source jobs + LinkedIn deeplink", () => {
    const hacked = applySearchHacks({
      ...defaultFilters(),
      keywords: ".NET",
      geo: "brazil",
      workplace: "remote",
      recency: "any",
      applyHacks: true,
    });
    const out = applyFilters(pool, hacked.filters);
    const sources = new Set(out.map((j) => j.source));
    assert.ok(out.length >= 10, `brazil soft too empty: ${out.length}`);
    assert.ok(sources.size >= 3, `expected ≥3 sources, got ${[...sources].join(",")}`);
    assert.ok(
      [...sources].some((s) => s !== "apinfo"),
      "must not be ApInfo-only"
    );
    assert.ok(
      hacked.external.some((e) => /linkedin/i.test(e.id + e.name)),
      "LinkedIn must be in external boards"
    );
    assert.ok(
      hacked.external.some((e) => /indeed/i.test(e.id + e.name)),
      "Indeed must be in external boards"
    );
    assert.ok(
      hacked.external.some((e) => /google/i.test(e.id + e.name)),
      "Google must be in external boards"
    );
  });

  it("always exposes LinkedIn deeplink even with hacks off", () => {
    const { external } = applySearchHacks({
      keywords: ".NET",
      workplace: "remote",
      recency: "24h",
      applyHacks: false,
    });
    assert.ok(external.some((e) => /linkedin/i.test(e.id + e.name)));
    const li = buildDeepLinks({ keywords: ".NET", workplace: "remote", recency: "24h" }).find(
      (l) => l.id === "linkedin"
    );
    assert.ok(li.url.includes("keywords=.NET") || li.url.includes("keywords=.net"));
    assert.ok(li.url.includes("f_WT=2"));
  });

  it("normalizes Himalayas/Muse static payloads when present", () => {
    const hima = normalizeHimalayas(load("data/himalayas-jobs.json"));
    const muse = normalizeTheMuse(load("data/themuse-jobs.json"));
    // Files may be empty before first fetch-live; still must not throw
    assert.ok(Array.isArray(hima));
    assert.ok(Array.isArray(muse));
    for (const j of hima.slice(0, 3)) {
      assert.equal(j.source, "himalayas");
      assert.ok(j.title);
    }
    for (const j of muse.slice(0, 3)) {
      assert.equal(j.source, "themuse");
      assert.ok(j.title);
    }
  });

  it("unknown language passes soft language filter", () => {
    const jobs = applyFilters(pool.slice(0, 80), {
      language: "en",
      recency: "any",
      workplace: "any",
      geo: "any",
      keywords: "",
      strictEligibility: false,
    });
    assert.ok(jobs.length > 0);
  });
});
