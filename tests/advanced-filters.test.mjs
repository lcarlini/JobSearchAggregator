import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeJob, parseSalary, detectWorkplace, detectEngagement } from "../assets/js/normalize.js";
import { applyFilters, sortJobs, marketPreset } from "../assets/js/filters.js";

describe("normalize detectors", () => {
  it("detects workplace and engagement", () => {
    assert.equal(detectWorkplace("Fully remote role worldwide"), "remote");
    assert.equal(detectWorkplace("Hybrid in São Paulo"), "hybrid");
    assert.equal(detectEngagement("Contratação via PJ com CNPJ"), "pj");
    assert.equal(detectEngagement("This is a CLT position in Brazil"), "clt");
    assert.equal(detectEngagement("Hire as contractor via B2B"), "contractor");
  });

  it("parses salary ranges", () => {
    const s = parseSalary("$120,000 - $150,000 USD per year");
    assert.equal(s.currency, "USD");
    assert.ok(s.min >= 120000);
    assert.ok(s.max >= 150000);
  });
});

describe("advanced filters", () => {
  const jobs = [
    makeJob({
      source: "t",
      title: "Senior .NET Engineer",
      company: "GitLab",
      url: "https://ex.com/1",
      description:
        "Fully remote work from anywhere. Brazil OK. Fluent English. Salary $140000 USD. Contractor via EOR.",
      location: "Worldwide",
      postedAt: Date.now() - 3600e3,
      salary: "$140,000 USD/year",
    }),
    makeJob({
      source: "t",
      title: "Junior PHP Developer",
      company: "Agency Recruiters Inc",
      url: "https://ex.com/2",
      description: "Onsite London office. Staffing agency role. No sponsorship.",
      location: "London, UK",
      postedAt: Date.now() - 10 * 86400e3,
    }),
    makeJob({
      source: "t",
      title: "React Developer",
      company: "Nubank",
      url: "https://ex.com/3",
      description: "Vaga CLT híbrida em São Paulo. Salário R$ 15.000 mês.",
      location: "São Paulo, Brasil",
      postedAt: Date.now() - 2 * 86400e3,
      salary: "R$ 15000/mês",
    }),
  ];

  it("filters remote + brazil OK", () => {
    const out = applyFilters(jobs, {
      workplace: "remote",
      brazilOk: true,
      recency: "any",
      geo: "any",
    });
    assert.ok(out.some((j) => j.title.includes(".NET")));
    assert.ok(!out.some((j) => j.title.includes("PHP")));
  });

  it("filters skills must-have", () => {
    const out = applyFilters(jobs, {
      skillsMust: ".NET",
      recency: "any",
      geo: "any",
      workplace: "any",
    });
    assert.equal(out.length, 1);
  });

  it("hides agencies", () => {
    const out = applyFilters(jobs, {
      noAgency: true,
      recency: "any",
      geo: "any",
      workplace: "any",
    });
    assert.ok(!out.some((j) => /agency/i.test(j.company)));
  });

  it("sorts by salary", () => {
    const sorted = sortJobs(jobs, "salary");
    assert.ok((sorted[0].salaryInfo?.min || 0) >= (sorted[1].salaryInfo?.min || 0));
  });

  it("market presets set currency/geo", () => {
    assert.equal(marketPreset("brazil").currency, "BRL");
    assert.equal(marketPreset("us").currency, "USD");
    assert.equal(marketPreset("europe").timezone, "CET");
    assert.equal(marketPreset("australia").timezone, "AEST");
    assert.equal(marketPreset("worldwide").remotePolicy, "any");
  });

  it("keeps remote US-tagged jobs under soft LATAM geo", () => {
    const usRemote = makeJob({
      source: "t",
      title: "Senior Backend Engineer",
      company: "Acme",
      url: "https://ex.com/us",
      description: "Fully remote. Work from anywhere.",
      location: "California, United States",
      postedAt: Date.now() - 3600e3,
    });
    const out = applyFilters([usRemote], {
      geo: "latam",
      workplace: "remote",
      recency: "any",
    });
    assert.equal(out.length, 1);
  });

  it("keeps jobs with unknown postedAt when recency is set", () => {
    const undated = makeJob({
      source: "t",
      title: "React Engineer",
      company: "X",
      url: "https://ex.com/u",
      description: "Remote React",
      location: "Remote",
      postedAt: null,
    });
    const out = applyFilters([undated], { recency: "3d", workplace: "any", geo: "any" });
    assert.equal(out.length, 1);
  });
});
