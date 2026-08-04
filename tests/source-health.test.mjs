/**
 * Source health + data-return tests.
 *
 * Always-on: static caches, job shapes, deeplink URL validity, catalog completeness.
 * Live network: run with JSA_LIVE_HEALTH=1 (or npm run test:live).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LIVE_APIS,
  ATS_SAMPLES,
  RSS_FEEDS,
  STATIC_CACHES,
  DEEPLINK_HOMES,
  builtDeeplinkUrls,
  jobShapeOk,
  ROOT,
} from "../scripts/lib/source-catalog.mjs";
import {
  checkStaticCache,
  checkJsonSource,
  checkRssSource,
  checkReachable,
  mapPool,
  summarize,
} from "../scripts/lib/health-check.mjs";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { normalizeApinfo } from "../assets/js/sources/apinfo.js";
import { normalizeHimalayas } from "../assets/js/sources/himalayas.js";
import { normalizeWeWorkRemotely } from "../assets/js/sources/weworkremotely.js";
import { normalizeTheMuse } from "../assets/js/sources/themuse.js";
import { normalizeRemoteJobsOrg } from "../assets/js/sources/remotejobsorg.js";
import { ADAPTERS } from "../assets/js/search-engine.js";
import { buildDeepLinks, buildLinkedInSearch, buildIndeedSearch, buildGoogleJobsSearch } from "../assets/js/sources/deeplinks.js";

const live = process.env.JSA_LIVE_HEALTH === "1";

describe("static source caches return data", () => {
  for (const src of STATIC_CACHES) {
    it(`${src.id} exists and meets min size${src.critical ? " (critical)" : ""}`, () => {
      const r = checkStaticCache(src);
      if (src.critical) {
        assert.equal(r.ok, true, `${src.id}: ${r.error}`);
      } else if (!r.ok) {
        // soft: warn via assert message only when completely missing
        assert.ok(fs.existsSync(path.join(ROOT, src.path)), `${src.id} file missing`);
      }
      assert.ok(r.count >= 0);
    });
  }

  it("static-ats jobs normalize to valid shapes", () => {
    const payload = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ats-jobs.json"), "utf8"));
    const jobs = normalizeStaticAts(payload);
    assert.ok(jobs.length >= 500, `ATS too small: ${jobs.length}`);
    const sample = jobs.slice(0, 50);
    const bad = sample.filter((j) => !jobShapeOk(j));
    assert.equal(bad.length, 0, `bad shapes: ${JSON.stringify(bad[0])}`);
    assert.ok(sample.every((j) => j.source === "static-ats"));
    const atsTypes = new Set(sample.map((j) => j.tags?.find((t) =>
      ["greenhouse", "lever", "ashby", "workable", "smartrecruiters", "bamboohr", "personio"].includes(t)
    )).filter(Boolean));
    assert.ok(atsTypes.size >= 1, "expected ATS tags on jobs");
  });

  it("apinfo / himalayas / wwr caches normalize with urls", () => {
    const ap = normalizeApinfo(
      JSON.parse(fs.readFileSync(path.join(ROOT, "data/apinfo-jobs.json"), "utf8"))
    );
    const hi = normalizeHimalayas(
      JSON.parse(fs.readFileSync(path.join(ROOT, "data/himalayas-jobs.json"), "utf8"))
    );
    const wwr = normalizeWeWorkRemotely(
      JSON.parse(fs.readFileSync(path.join(ROOT, "data/weworkremotely-jobs.json"), "utf8"))
    );
    assert.ok(ap.length >= 50);
    assert.ok(hi.length >= 50);
    assert.ok(wwr.length >= 50);
    for (const batch of [ap.slice(0, 20), hi.slice(0, 20), wwr.slice(0, 20)]) {
      assert.ok(batch.every(jobShapeOk));
    }
  });

  it("themuse + remotejobsorg caches normalize when present", () => {
    const muse = normalizeTheMuse(
      JSON.parse(fs.readFileSync(path.join(ROOT, "data/themuse-jobs.json"), "utf8"))
    );
    const rjo = normalizeRemoteJobsOrg(
      JSON.parse(fs.readFileSync(path.join(ROOT, "data/remotejobsorg-jobs.json"), "utf8"))
    );
    assert.ok(Array.isArray(muse));
    assert.ok(Array.isArray(rjo));
    if (muse.length) assert.ok(muse.slice(0, 10).every(jobShapeOk));
    if (rjo.length) assert.ok(rjo.slice(0, 10).every(jobShapeOk));
  });
});

describe("deeplink builders produce valid https URLs", () => {
  it("primary LinkedIn / Indeed / Google / Glassdoor are https with query", () => {
    const filters = {
      keywords: ".NET, C#",
      geo: "brazil",
      workplace: "remote",
      recency: "24h",
    };
    const li = buildLinkedInSearch(filters);
    const indeed = buildIndeedSearch(filters);
    const google = buildGoogleJobsSearch(filters);
    for (const url of [li, indeed, google]) {
      assert.match(url, /^https:\/\//);
      const u = new URL(url);
      assert.ok(u.search.length > 1 || u.pathname.length > 1);
    }
    assert.ok(li.includes("linkedin.com"));
    assert.ok(indeed.includes("indeed.com"));
    assert.ok(google.includes("google.com"));
  });

  it("buildDeepLinks returns unique ids and valid https urls", () => {
    const links = buildDeepLinks({
      keywords: "React",
      geo: "latam",
      workplace: "remote",
    });
    assert.ok(links.length >= 20, `too few deeplinks: ${links.length}`);
    const ids = new Set();
    for (const l of links) {
      assert.ok(l.id && l.name && l.url, `incomplete link ${JSON.stringify(l)}`);
      assert.match(l.url, /^https:\/\//, `${l.id} not https`);
      assert.doesNotThrow(() => new URL(l.url), `${l.id} invalid URL`);
      assert.ok(!ids.has(l.id), `duplicate deeplink id ${l.id}`);
      ids.add(l.id);
    }
  });

  it("catalog DEEPLINK_HOMES are valid https", () => {
    for (const h of DEEPLINK_HOMES) {
      assert.match(h.url, /^https:\/\//);
      assert.doesNotThrow(() => new URL(h.url));
    }
  });
});

describe("source catalog completeness", () => {
  it("ADAPTERS cover expected ingest sources", () => {
    const ids = new Set(ADAPTERS.map((a) => a.id));
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
      assert.ok(ids.has(id), `missing adapter ${id}`);
    }
  });

  it("LIVE_APIS / ATS_SAMPLES / RSS catalogs are non-empty", () => {
    assert.ok(LIVE_APIS.length >= 5);
    assert.ok(ATS_SAMPLES.length >= 4);
    assert.ok(RSS_FEEDS.length >= 1);
    assert.ok(STATIC_CACHES.every((s) => s.path && s.id));
  });

  it("companies.json has greenhouse+ashby+lever boards", () => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, "data/companies.json"), "utf8"));
    assert.ok(c.greenhouse.length >= 50);
    assert.ok(c.ashby.length >= 20);
    assert.ok(c.lever.length >= 5);
    assert.ok(Array.isArray(c.workday) && c.workday.length >= 1);
    assert.ok(ATS_SAMPLES.some((s) => s.ats === "workday"));
  });
});

describe("live source health (JSA_LIVE_HEALTH=1)", { skip: !live }, () => {
  it("critical live JSON APIs return items", async () => {
    const critical = LIVE_APIS.filter((s) => s.critical);
    const results = [];
    for (const src of critical) {
      results.push(await checkJsonSource(src));
    }
    const failed = results.filter((r) => !r.ok);
    assert.equal(
      failed.length,
      0,
      failed.map((f) => `${f.id}: ${f.error}`).join("; ")
    );
  });

  it("critical ATS samples return job arrays", async () => {
    const critical = ATS_SAMPLES.filter((s) => s.critical);
    const results = [];
    for (const src of critical) {
      results.push(await checkJsonSource(src));
    }
    const failed = results.filter((r) => !r.ok);
    assert.equal(
      failed.length,
      0,
      failed.map((f) => `${f.id}: ${f.error}`).join("; ")
    );
  });

  it("critical RSS feeds contain items", async () => {
    for (const src of RSS_FEEDS.filter((s) => s.critical)) {
      const r = await checkRssSource(src);
      assert.equal(r.ok, true, `${src.id}: ${r.error}`);
    }
  });

  it("critical deeplink homes are reachable", async () => {
    const critical = DEEPLINK_HOMES.filter((s) => s.critical);
    const results = await mapPool(critical, 5, (src) => checkReachable(src));
    const failed = results.filter((r) => !r.ok);
    assert.equal(
      failed.length,
      0,
      failed.map((f) => `${f.id}: ${f.error || f.status}`).join("; ")
    );
  });

  it("full health summary has zero critical failures", async () => {
    const results = [
      ...STATIC_CACHES.map(checkStaticCache),
    ];
    for (const src of LIVE_APIS) results.push(await checkJsonSource(src));
    for (const src of ATS_SAMPLES) results.push(await checkJsonSource(src));
    for (const src of RSS_FEEDS) results.push(await checkRssSource(src));
    const homes = await mapPool(DEEPLINK_HOMES, 8, (s) => checkReachable(s));
    results.push(...homes);
    const summary = summarize(results);
    assert.equal(
      summary.criticalFailed,
      0,
      `critical fails: ${summary.criticalFailIds.join(", ")}`
    );
  });
});

describe("built deeplink host sample", { skip: !live }, () => {
  it("unique hosts from Brazil .NET search mostly respond", async () => {
    const links = builtDeeplinkUrls();
    const byHost = new Map();
    for (const l of links) {
      try {
        const host = new URL(l.url).host;
        if (!byHost.has(host)) byHost.set(host, l);
      } catch {
        assert.fail(`bad url ${l.id}`);
      }
    }
    const sample = [...byHost.values()].slice(0, 40);
    const results = await mapPool(sample, 8, (src) =>
      checkReachable({ id: src.id, url: new URL(src.url).origin + "/", critical: false })
    );
    const okRate = results.filter((r) => r.ok).length / results.length;
    assert.ok(okRate >= 0.6, `host ok rate ${okRate} too low`);
  });
});
