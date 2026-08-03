import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRemoteOk } from "../assets/js/sources/remoteok.js";
import { normalizeRemotive } from "../assets/js/sources/remotive.js";
import { normalizeArbeitnow } from "../assets/js/sources/arbeitnow.js";
import { normalizeJobicy } from "../assets/js/sources/jobicy.js";
import { normalizeAshby } from "../assets/js/sources/ashby.js";
import { normalizeStaticAts } from "../assets/js/sources/static-ats.js";
import { normalizeApinfo } from "../assets/js/sources/apinfo.js";
import { applyFilters } from "../assets/js/filters.js";
import { dedupeJobs, makeJob, detectGeoFlags } from "../assets/js/normalize.js";
import { buildDeepLinks } from "../assets/js/sources/deeplinks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fix = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

describe("adapters normalize fixtures", () => {
  it("normalizes RemoteOK", () => {
    const jobs = normalizeRemoteOk(fix("remoteok.json"));
    assert.ok(jobs.length >= 1);
    for (const j of jobs) {
      assert.equal(j.source, "remoteok");
      assert.ok(j.title);
      assert.ok(j.url.startsWith("http"));
    }
  });

  it("normalizes Remotive", () => {
    const jobs = normalizeRemotive(fix("remotive.json"));
    assert.ok(jobs.length >= 1);
    assert.equal(jobs[0].source, "remotive");
  });

  it("normalizes Arbeitnow", () => {
    const jobs = normalizeArbeitnow(fix("arbeitnow.json"));
    assert.ok(jobs.length >= 1);
    assert.equal(jobs[0].source, "arbeitnow");
  });

  it("normalizes Jobicy", () => {
    const jobs = normalizeJobicy(fix("jobicy.json"));
    assert.ok(jobs.length >= 1);
    assert.equal(jobs[0].source, "jobicy");
  });

  it("normalizes Ashby", () => {
    const jobs = normalizeAshby(fix("ashby.json"), "truelogic");
    assert.ok(jobs.length >= 1);
    assert.equal(jobs[0].source, "ashby");
    assert.equal(jobs[0].company, "truelogic");
  });

  it("normalizes static ATS payload", () => {
    const jobs = normalizeStaticAts({
      jobs: [
        {
          id: "greenhouse:stripe:1",
          ats: "greenhouse",
          title: "Backend Engineer",
          company: "stripe",
          url: "https://example.com/1",
          description: "Remote worldwide Python",
          location: "Remote",
          postedAt: new Date().toISOString(),
        },
      ],
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, "Backend Engineer");
  });

  it("normalizes ApInfo payload and keeps distinct codvaga URLs", () => {
    const jobs = normalizeApinfo({
      jobs: [
        {
          id: "apinfo:1",
          title: "Dev .NET",
          company: "Acme",
          url: "https://www.apinfo.com/apinfo/inc/list44.cfm?codvaga=1",
          location: "Home Office - HO",
          description: "Remoto C#",
          postedAt: new Date().toISOString(),
          tags: ["apinfo"],
        },
        {
          id: "apinfo:2",
          title: "Dev Java",
          company: "Beta",
          url: "https://www.apinfo.com/apinfo/inc/list44.cfm?codvaga=2",
          location: "São Paulo - SP",
          description: "Java",
          postedAt: new Date().toISOString(),
          tags: ["apinfo"],
        },
      ],
    });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].source, "apinfo");
    assert.equal(dedupeJobs(jobs).length, 2);
  });
});

describe("filters", () => {
  const base = [
    makeJob({
      source: "test",
      title: "Senior .NET Engineer",
      company: "Acme",
      url: "https://example.com/a",
      description: "Remote LATAM friendly. Brazil candidates welcome. C# ASP.NET",
      location: "Remote LATAM",
      postedAt: Date.now() - 2 * 3600 * 1000,
    }),
    makeJob({
      source: "test",
      title: "Junior PHP Developer",
      company: "Other",
      url: "https://example.com/b",
      description: "Onsite only London office",
      location: "London, UK",
      postedAt: Date.now() - 10 * 24 * 3600 * 1000,
    }),
    makeJob({
      source: "test",
      title: "React Freelance Contractor",
      company: "GigCo",
      url: "https://example.com/c",
      description: "Freelance contract worldwide remote",
      location: "Worldwide",
      postedAt: Date.now() - 5 * 3600 * 1000,
      jobType: "freelance",
    }),
  ];

  it("filters by title include/exclude", () => {
    const out = applyFilters(base, {
      titleInclude: ".NET",
      titleExclude: "Junior",
      recency: "any",
      geo: "any",
    });
    assert.equal(out.length, 1);
    assert.match(out[0].title, /\.NET/i);
  });

  it("filters last 24 hours", () => {
    const out = applyFilters(base, { recency: "24h", geo: "any" });
    assert.ok(out.every((j) => Date.now() - j.postedAt <= 86400000));
    assert.ok(out.some((j) => j.title.includes(".NET")));
    assert.ok(!out.some((j) => j.title.includes("PHP")));
  });

  it("filters description must include", () => {
    const out = applyFilters(base, {
      descInclude: "Brazil",
      recency: "any",
      geo: "any",
    });
    assert.equal(out.length, 1);
  });

  it("filters freelance type", () => {
    const out = applyFilters(base, {
      jobType: "freelance",
      recency: "any",
      geo: "any",
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].company, "GigCo");
  });

  it("dedupes by url", () => {
    const dup = dedupeJobs([...base, { ...base[0], id: "x" }]);
    assert.equal(dup.length, base.length);
  });
});

describe("geo heuristics", () => {
  it("detects LATAM/Brazil", () => {
    const g = detectGeoFlags("Hiring in Brazil and LATAM", "Remote");
    assert.equal(g.brazil, true);
    assert.equal(g.latamFriendly, true);
  });
});

describe("deep links", () => {
  it("builds LinkedIn with 24h and remote", () => {
    const links = buildDeepLinks({
      keywords: ".NET",
      recency: "24h",
      geo: "latam",
      jobType: "full-time",
    });
    const li = links.find((l) => l.id === "linkedin");
    assert.ok(li.url.includes("linkedin.com/jobs/search"));
    assert.ok(li.url.includes("f_TPR=r86400"));
    assert.ok(li.url.includes("f_WT=2"));
  });

  it("builds Indeed BR host for brazil geo", () => {
    const links = buildDeepLinks({ keywords: "React", geo: "brazil", recency: "24h" });
    const indeed = links.find((l) => l.id === "indeed");
    assert.ok(indeed.url.startsWith("https://br.indeed.com"));
    assert.ok(indeed.url.includes("fromage=1"));
  });

  it("builds Google Jobs with after: operator", () => {
    const links = buildDeepLinks({ keywords: "DevOps", recency: "7d", geo: "uk-br" });
    const g = links.find((l) => l.id === "googlejobs");
    assert.ok(g.url.includes("google.com/search"));
    assert.ok(decodeURIComponent(g.url).includes("after:"));
  });
});
