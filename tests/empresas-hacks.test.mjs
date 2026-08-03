import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeepLinks, groupDeepLinks } from "../assets/js/sources/deeplinks.js";
import { buildSearchRecipes, OPERATOR_DOCS } from "../assets/js/search-hacks.js";
import { filterCompanies, groupCompanies } from "../assets/js/companies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const empresas = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/empresas.json"), "utf8")
);

describe("empresas catalog", () => {
  it("features ApInfo from bookmark Empresas", () => {
    const ap = empresas.companies.find((c) => /apinfo/i.test(c.name));
    assert.ok(ap, "ApInfo missing");
    assert.equal(ap.featured, true);
    assert.equal(ap.region, "brazil");
    assert.ok(ap.url.includes("apinfo.com"));
    assert.ok(empresas.featured?.some((c) => /apinfo/i.test(c.name)));
  });

  it("includes curated Brazil boards", () => {
    const names = empresas.companies.map((c) => c.name.toLowerCase());
    for (const need of ["remotar", "programathor", "gupy remote", "99freelas", "catho", "apinfo"]) {
      assert.ok(
        names.some((n) => n.includes(need.split(" ")[0])),
        `missing ${need}`
      );
    }
  });

  it("includes US/EU/AU companies hiring BR", () => {
    const byRegion = Object.fromEntries(
      ["us-br", "eu-br", "au-br"].map((r) => [
        r,
        empresas.companies.filter((c) => c.region === r).map((c) => c.name),
      ])
    );
    assert.ok(byRegion["us-br"].some((n) => /tecla|gitlab|toptal/i.test(n)));
    assert.ok(byRegion["eu-br"].some((n) => /spotify|revolut|wise/i.test(n)));
    assert.ok(byRegion["au-br"].some((n) => /atlassian|canva/i.test(n)));
  });

  it("filters and groups companies", () => {
    const filtered = filterCompanies(empresas.companies, {
      q: "gitlab",
      region: "any",
    });
    assert.ok(filtered.length >= 1);
    const groups = groupCompanies(empresas.companies);
    assert.ok(groups.length >= 3);
  });
});

describe("expanded deeplinks", () => {
  it("includes Remotar, Dynamite, Atlassian groups", () => {
    const links = buildDeepLinks({ keywords: ".NET", geo: "brazil", recency: "24h" });
    const ids = new Set(links.map((l) => l.id));
    for (const id of ["apinfo", "remotar", "dynamite", "atlassian", "linkedin-br", "torre", "lapieza"]) {
      assert.ok(ids.has(id), `missing deeplink ${id}`);
    }
    const groups = groupDeepLinks(links);
    assert.ok(groups.some((g) => g.id === "brazil"));
    assert.ok(groups.some((g) => g.id === "au-br"));
  });

  it("supports LinkedIn 2h f_TPR hack", () => {
    const links = buildDeepLinks({ keywords: "React", recency: "2h" });
    const li = links.find((l) => l.id === "linkedin");
    assert.ok(li.url.includes("f_TPR=r7200"));
  });
});

describe("search hacks", () => {
  it("has operator docs for google/linkedin/indeed", () => {
    assert.ok(OPERATOR_DOCS.google.length >= 8);
    assert.ok(OPERATOR_DOCS.linkedin.some((o) => o.op.includes("f_TPR")));
    assert.ok(OPERATOR_DOCS.indeed.length >= 3);
  });

  it("builds recipes with openable URLs", () => {
    const recipes = buildSearchRecipes({
      keywords: "C#, .NET",
      recency: "24h",
      seniority: "senior",
    });
    assert.ok(recipes.length >= 6);
    const li2h = recipes.find((r) => r.id === "li-2h");
    assert.ok(li2h.url.includes("f_TPR=r7200"));
    const gLi = recipes.find((r) => r.id === "g-linkedin-jobs");
    assert.ok(gLi.query.includes("site:linkedin.com/jobs"));
  });
});
