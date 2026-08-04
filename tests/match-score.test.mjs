import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeMatchScore, matchTier, isFreshJob } from "../assets/js/match-score.js";
import { filtersToSearchParams, searchParamsToFilters } from "../assets/js/url-filters.js";
import { updateInterest, loadInterests, toggleInterest } from "../assets/js/interests.js";

describe("match score", () => {
  it("scores higher when skills appear in the job", () => {
    const job = {
      title: "Senior .NET Engineer",
      company: "Acme",
      description: "Remote worldwide Azure SQL C# ASP.NET",
      workplace: "remote",
      remoteScope: "worldwide",
      postedAt: Date.now(),
    };
    const low = computeMatchScore(job, { keywords: "PHP, Ruby" });
    const high = computeMatchScore(job, { keywords: ".NET, C#", skillsMust: "Azure, SQL" });
    assert.ok(high.score > low.score);
    assert.equal(matchTier(high.score), "high");
    assert.ok(high.hits.includes("azure") || high.hits.includes("sql") || high.hits.includes(".net"));
  });

  it("detects fresh jobs", () => {
    assert.equal(isFreshJob({ postedAt: Date.now() - 3600e3 }, 48), true);
    assert.equal(isFreshJob({ postedAt: Date.now() - 10 * 86400e3 }, 48), false);
  });
});

describe("shareable URL filters", () => {
  it("round-trips key filters", () => {
    const filters = {
      keywords: ".NET",
      geo: "canada",
      workplace: "remote",
      remoteScope: "worldwide",
      salaryMin: "100000",
      brazilOk: true,
      noAgency: true,
    };
    const p = filtersToSearchParams(filters);
    const back = searchParamsToFilters(p);
    assert.equal(back.keywords, ".NET");
    assert.equal(back.geo, "canada");
    assert.equal(back.remoteScope, "worldwide");
    assert.equal(back.salaryMin, "100000");
    assert.equal(back.brazilOk, true);
    assert.equal(back.noAgency, true);
  });
});

describe("interest status", () => {
  it("updates application status and notes", () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    let list = loadInterests();
    const job = { url: "https://ex.com/1", title: "Dev", company: "A", source: "t" };
    list = toggleInterest(list, job).list;
    list = updateInterest(list, job.url, { status: "applied", notes: "Sent CV" });
    assert.equal(list[0].status, "applied");
    assert.equal(list[0].notes, "Sent CV");
    delete globalThis.localStorage;
  });
});
