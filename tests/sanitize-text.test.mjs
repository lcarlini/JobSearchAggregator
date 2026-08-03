import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, makeJob } from "../assets/js/normalize.js";
import { applyFilters } from "../assets/js/filters.js";

describe("sanitizeText before display", () => {
  it("repairs UTF-8 mojibake", () => {
    assert.equal(sanitizeText("SÃ£o Paulo"), "São Paulo");
    assert.equal(sanitizeText("obrigatÃ³rio"), "obrigatório");
  });

  it("fixes glued Portuguese role titles", () => {
    const t = sanitizeText("Engenheirode Automaçãocom IA (Backend)", { title: true });
    assert.match(t, /Engenheiro de/i);
    assert.match(t, /Automação com/i);
  });

  it("makeJob sanitizes title/location/description", () => {
    const j = makeJob({
      source: "apinfo",
      title: "Engenheirode Automaçãocom IA",
      company: "RDC",
      url: "https://example.com/1",
      description: "conhecimentos tÃ©cnicos obrigatÃ³rio",
      location: "SÃ£o Caetano do Sul - SP",
    });
    assert.match(j.title, /Engenheiro de/i);
    assert.match(j.location, /São/);
    assert.match(j.description, /técnicos|obrigatório/);
    assert.ok(!j.title.includes("\uFFFD"));
  });
});

describe("multi-select filters OR", () => {
  const jobs = [
    makeJob({
      source: "t",
      title: "Senior Remote Engineer",
      company: "A",
      url: "https://a.com",
      description: "Fully remote senior",
      location: "Remote",
      workplace: "remote",
      postedAt: Date.now(),
    }),
    makeJob({
      source: "t",
      title: "Hybrid Pleno Dev",
      company: "B",
      url: "https://b.com",
      description: "Híbrido pleno São Paulo Brasil",
      location: "São Paulo, Brasil",
      workplace: "hybrid",
      postedAt: Date.now(),
    }),
    makeJob({
      source: "t",
      title: "Onsite Junior",
      company: "C",
      url: "https://c.com",
      description: "Presencial junior",
      location: "NYC",
      workplace: "onsite",
      postedAt: Date.now(),
    }),
  ];

  it("workplace remote,hybrid keeps both", () => {
    const out = applyFilters(jobs, {
      workplace: "remote,hybrid",
      geo: "any",
      recency: "any",
      keywords: "",
    });
    assert.equal(out.length, 2);
    assert.ok(out.every((j) => j.workplace !== "onsite"));
  });

  it("geo latam,brazil is OR not exclusive", () => {
    const out = applyFilters(jobs, {
      workplace: "any",
      geo: "latam,brazil",
      recency: "any",
      keywords: "",
    });
    assert.ok(out.some((j) => j.company === "B"));
  });

  it("seniority mid,senior matches either", () => {
    const out = applyFilters(jobs, {
      workplace: "any",
      geo: "any",
      seniority: "mid,senior",
      recency: "any",
      keywords: "",
    });
    assert.ok(out.some((j) => /Senior/i.test(j.title)));
    assert.ok(out.some((j) => /Pleno/i.test(j.title)));
    assert.ok(!out.some((j) => /Junior/i.test(j.title)));
  });
});
