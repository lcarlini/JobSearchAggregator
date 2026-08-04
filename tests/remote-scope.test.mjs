import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeJob,
  detectRemoteScope,
  detectGeoFlags,
} from "../assets/js/normalize.js";
import { applyFilters, marketPreset } from "../assets/js/filters.js";
import { buildDeepLinks, groupDeepLinks } from "../assets/js/sources/deeplinks.js";

describe("remote scope detection", () => {
  it("detects worldwide vs country-only remote", () => {
    assert.equal(
      detectRemoteScope("Work from anywhere. Hire globally.", "Worldwide", {
        workplace: "remote",
        remotePolicy: "anywhere",
        geo: { worldwide: true },
      }),
      "worldwide"
    );
    assert.equal(
      detectRemoteScope("Must be located in the United States. Remote US only.", "Remote - USA", {
        workplace: "remote",
        remotePolicy: "country-restricted",
        geo: { us: true },
      }),
      "country"
    );
    assert.equal(
      detectRemoteScope("LATAM only remote role", "LATAM", {
        workplace: "remote",
        remotePolicy: "latam-only",
        geo: { latamFriendly: true },
      }),
      "region"
    );
  });

  it("does not treat fully remote alone as worldwide", () => {
    const job = makeJob({
      source: "t",
      title: "Fully remote engineer",
      company: "Acme",
      url: "https://ex.com/fr",
      description: "Fully remote role. 100% remote. Python.",
      location: "Remote",
    });
    assert.equal(job.workplace, "remote");
    assert.notEqual(job.remoteScope, "worldwide");
    assert.equal(job.geo.worldwide, false);
  });

  it("filters by remoteScope worldwide", () => {
    const jobs = [
      makeJob({
        source: "t",
        title: "Global Engineer",
        company: "A",
        url: "https://ex.com/w",
        description: "Work from anywhere worldwide.",
        location: "Worldwide",
      }),
      makeJob({
        source: "t",
        title: "US Remote Only",
        company: "B",
        url: "https://ex.com/c",
        description: "Remote US only. Must be located in the United States.",
        location: "Remote - USA",
      }),
    ];
    const world = applyFilters(jobs, { remoteScope: "worldwide", workplace: "any", geo: "any", recency: "any" });
    assert.ok(world.some((j) => j.title.includes("Global")));
    assert.ok(!world.some((j) => j.title.includes("US Remote")));

    const country = applyFilters(jobs, { remoteScope: "country", workplace: "any", geo: "any", recency: "any" });
    assert.ok(country.some((j) => j.title.includes("US Remote")));
  });
});

describe("expanded geo markets", () => {
  it("detects canada, nz, uae and EU countries", () => {
    const g = detectGeoFlags("Remote role in Toronto, Canada", "Toronto");
    assert.equal(g.canada, true);
    const nz = detectGeoFlags("Auckland New Zealand remote", "Auckland");
    assert.equal(nz.newZealand, true);
    const uae = detectGeoFlags("Dubai UAE engineering", "Dubai");
    assert.equal(uae.uae, true);
    const pt = detectGeoFlags("Lisbon Portugal remote", "Lisboa");
    assert.equal(pt.portugal, true);
    assert.equal(pt.europe, true);
  });

  it("filters soft country markets", () => {
    const jobs = [
      makeJob({
        source: "t",
        title: "Dev Canada",
        company: "C",
        url: "https://ex.com/ca",
        description: "Remote Canada. Toronto timezone.",
        location: "Toronto, Canada",
      }),
      makeJob({
        source: "t",
        title: "Dev UAE",
        company: "D",
        url: "https://ex.com/ae",
        description: "Remote Dubai UAE.",
        location: "Dubai, UAE",
      }),
      makeJob({
        source: "t",
        title: "Dev Portugal",
        company: "E",
        url: "https://ex.com/pt",
        description: "Remote Portugal Lisbon.",
        location: "Lisbon, Portugal",
      }),
    ];
    assert.ok(applyFilters(jobs, { geo: "canada", workplace: "any", recency: "any" }).some((j) => j.title.includes("Canada")));
    assert.ok(applyFilters(jobs, { geo: "uae", workplace: "any", recency: "any" }).some((j) => j.title.includes("UAE")));
    assert.ok(applyFilters(jobs, { geo: "portugal", workplace: "any", recency: "any" }).some((j) => j.title.includes("Portugal")));
    assert.ok(applyFilters(jobs, { geo: "europe", workplace: "any", recency: "any" }).some((j) => j.title.includes("Portugal")));
  });

  it("market presets exist for new regions", () => {
    assert.equal(marketPreset("canada").geo, "canada");
    assert.equal(marketPreset("uae").geo, "uae");
    assert.equal(marketPreset("portugal").geo, "portugal");
    assert.equal(marketPreset("new-zealand").geo, "nz");
    assert.equal(marketPreset("worldwide").remoteScope, "worldwide");
  });

  it("deeplinks include Canada, NZ and UAE boards", () => {
    const links = buildDeepLinks({ keywords: ".NET", geo: "canada", workplace: "remote" });
    const ids = new Set(links.map((l) => l.id));
    assert.ok(ids.has("indeed-ca"));
    assert.ok(ids.has("seek-nz"));
    assert.ok(ids.has("bayt"));
    const groups = groupDeepLinks(links).map((g) => g.id);
    assert.ok(groups.includes("canada"));
    assert.ok(groups.includes("nz"));
    assert.ok(groups.includes("uae"));
  });
});
