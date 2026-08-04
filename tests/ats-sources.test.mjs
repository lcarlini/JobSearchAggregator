import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { dedupeJobs, makeJob } from "../assets/js/normalize.js";
import { hackScore } from "../assets/js/apply-hacks.js";
import { buildDeepLinks } from "../assets/js/sources/deeplinks.js";

describe("expanded ATS payloads", () => {
  it("normalizes Workable / SmartRecruiters / Recruitee static rows", () => {
    const jobs = normalizeStaticAts({
      jobs: [
        {
          id: "workable:codurance:abc",
          ats: "workable",
          title: "Senior .NET Engineer",
          company: "Codurance",
          url: "https://apply.workable.com/codurance/j/abc/",
          description: "Remote C# Azure",
          location: "Remote",
          postedAt: new Date().toISOString(),
          tags: ["codurance", "workable"],
        },
        {
          id: "smartrecruiters:Visa:1",
          ats: "smartrecruiters",
          title: "Software Engineer",
          company: "Visa",
          url: "https://jobs.smartrecruiters.com/Visa/1",
          description: "Java remote",
          location: "Remote",
          postedAt: new Date().toISOString(),
          tags: ["Visa", "smartrecruiters"],
        },
        {
          id: "recruitee:typeform:9",
          ats: "recruitee",
          title: "Backend Engineer",
          company: "Typeform",
          url: "https://typeform.recruitee.com/o/backend",
          description: "Remote TypeScript",
          location: "Remote Europe",
          postedAt: new Date().toISOString(),
          tags: ["typeform", "recruitee"],
        },
      ],
    });
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((j) => j.source === "static-ats"));
    assert.ok(jobs.some((j) => j.tags.includes("workable")));
    assert.ok(jobs.some((j) => j.tags.includes("smartrecruiters")));
    assert.ok(jobs.some((j) => j.tags.includes("recruitee")));
  });

  it("dedupe prefers ATS over ApInfo for same title+company", () => {
    const ap = makeJob({
      id: "apinfo:x",
      source: "apinfo",
      title: "Senior .NET Engineer",
      company: "Globex",
      url: "https://www.apinfo.com/apinfo/inc/list44.cfm?codvaga=99",
      description: "Remoto C#",
      location: "Home Office",
    });
    const ats = makeJob({
      id: "greenhouse:globex:1",
      source: "static-ats",
      title: "Senior .NET Engineer",
      company: "Globex",
      url: "https://boards.greenhouse.io/globex/jobs/1",
      description: "Remote worldwide C#",
      location: "Remote",
    });
    const out = dedupeJobs([ap, ats]);
    assert.equal(out.length, 1);
    assert.equal(out[0].source, "static-ats");
  });

  it("hackScore ranks title-matching ATS above weak ApInfo hits", () => {
    const kws = [".net", "c#", "dotnet"];
    const filters = { _remoteBoost: ["remote"], _geoBoost: ["brazil"] };
    const ats = makeJob({
      source: "static-ats",
      title: "Senior .NET Developer",
      company: "Stripe",
      url: "https://ex.com/ats",
      description: "Remote worldwide",
      location: "Worldwide",
    });
    const apWeak = makeJob({
      source: "apinfo",
      title: "Analista de Sistemas",
      company: "Local Co",
      url: "https://ex.com/ap",
      description: "Mentions .net once in a long text about maintenance",
      location: "São Paulo",
    });
    ats.hackScore = hackScore(ats, filters, kws);
    apWeak.hackScore = hackScore(apWeak, filters, kws);
    assert.ok(ats.hackScore > apWeak.hackScore);
  });

  it("exposes LATAM employer LinkedIn company deeplinks for brazil geo", () => {
    const links = buildDeepLinks({
      keywords: ".NET",
      geo: "brazil",
      workplace: "remote",
      recency: "any",
    });
    assert.ok(links.some((l) => l.id === "linkedin"));
    assert.ok(links.some((l) => l.id === "li-co-nubank"));
    assert.ok(links.some((l) => l.id === "li-co-ciandt"));
    const nu = links.find((l) => l.id === "li-co-nubank");
    assert.ok(nu.url.includes("linkedin.com/jobs"));
    assert.ok(nu.url.includes("f_WT=2"));
  });
});
