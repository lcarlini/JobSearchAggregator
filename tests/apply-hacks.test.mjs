import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expandKeywords, applySearchHacks, hackScore } from "../assets/js/apply-hacks.js";
import { makeJob } from "../assets/js/normalize.js";

describe("apply search hacks", () => {
  it("expands .NET synonyms like Google/LinkedIn OR", () => {
    const exp = expandKeywords(".NET, React");
    assert.ok(exp.some((t) => t.includes("dotnet") || t.includes("c#") || t.includes("csharp")));
    assert.ok(exp.some((t) => t.includes("react")));
  });

  it("applies exclude-junior and multi-api when senior + hacks on", () => {
    const { filters, applied, apiQueries, external } = applySearchHacks({
      keywords: ".NET, C#",
      seniority: "senior",
      geo: "latam",
      market: "latam",
      brazilOk: true,
      applyHacks: true,
      workplace: "remote",
    });
    assert.ok(applied.includes("synonym-or") || filters.keywords.includes("dotnet") || filters.keywords.includes("csharp"));
    assert.ok(applied.includes("exclude-junior"));
    assert.ok(filters.titleExclude.toLowerCase().includes("junior"));
    assert.ok(applied.includes("multi-api-query"));
    assert.ok(apiQueries.remotiveCategories.includes("software-dev"));
    assert.ok(external.some((e) => e.id === "li-2h" || e.url.includes("f_TPR=r7200")));
  });

  it("does nothing destructive when hacks off", () => {
    const { applied, filters } = applySearchHacks({
      keywords: ".NET",
      applyHacks: false,
      titleExclude: "",
    });
    assert.deepEqual(applied, []);
    assert.equal(filters.keywords, ".NET");
  });

  it("scores BR remote jobs higher", () => {
    const enhanced = applySearchHacks({
      keywords: ".NET",
      geo: "latam",
      applyHacks: true,
    }).filters;
    const a = makeJob({
      source: "t",
      title: "Senior .NET Engineer",
      company: "X",
      url: "https://a.com",
      description: "Remote worldwide Brazil OK LATAM",
      location: "Remote",
      postedAt: Date.now(),
    });
    const b = makeJob({
      source: "t",
      title: "Office Manager",
      company: "Y",
      url: "https://b.com",
      description: "Onsite only",
      location: "NYC",
      postedAt: Date.now() - 30 * 86400e3,
    });
    assert.ok(hackScore(a, enhanced, [".net", "c#"]) > hackScore(b, enhanced, [".net", "c#"]));
  });
});
