import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeepLinks,
  buildLinkedInSearch,
  buildIndeedSearch,
  buildGoogleJobsSearch,
  fullSearchQuery,
  filterQueryExtras,
} from "../assets/js/sources/deeplinks.js";
import { applySearchHacks } from "../assets/js/apply-hacks.js";

const richFilters = {
  keywords: ".NET, C#",
  titleInclude: "Senior",
  titleExclude: "Intern",
  skillsMust: "Azure, SQL",
  geo: "canada",
  workplace: "remote",
  remoteScope: "worldwide",
  seniority: "senior",
  jobType: "full-time",
  recency: "7d",
  language: "en",
  brazilOk: false,
  noAgency: true,
};

describe("filter parity on consolidated platforms", () => {
  it("builds a shared query with skills, scope, seniority and workplace", () => {
    const q = fullSearchQuery(richFilters);
    const extras = filterQueryExtras(richFilters);
    assert.match(q, /\.NET|C#/i);
    assert.match(extras, /Azure|SQL/i);
    assert.match(extras, /work from anywhere|worldwide/i);
    assert.match(extras, /remote|remoto/i);
    assert.match(extras, /-junior/i);
    assert.match(extras, /full-time|permanent/i);
    assert.match(extras, /English/i);
  });

  it("LinkedIn URL carries the same core filters", () => {
    const url = buildLinkedInSearch(richFilters);
    const u = decodeURIComponent(url);
    assert.match(url, /linkedin\.com\/jobs\/search/);
    assert.match(url, /f_WT=2/);
    assert.match(url, /f_TPR=r604800/);
    assert.match(url, /f_JT=F/);
    assert.match(url, /f_E=4/);
    assert.match(url, /geoId=101174742/);
    assert.match(u, /Senior/);
    assert.match(u, /-Intern|-"Intern"/i);
    assert.match(u, /Azure|SQL/i);
    assert.match(u, /work from anywhere|worldwide/i);
  });

  it("Indeed uses country host and same query extras", () => {
    const url = buildIndeedSearch(richFilters);
    const u = decodeURIComponent(url);
    assert.match(url, /ca\.indeed\.com/);
    assert.match(url, /fromage=7/);
    assert.match(url, /remotejob=032/);
    assert.match(u, /Azure|SQL/i);
    assert.match(u, /worldwide|work from anywhere/i);
  });

  it("Google Jobs includes market + after + scope", () => {
    const url = buildGoogleJobsSearch(richFilters);
    const u = decodeURIComponent(url);
    assert.match(url, /google\.com\/search/);
    assert.match(url, /ibp=htl%3Bjobs|ibp=htl;jobs/);
    assert.match(u, /Canada|Toronto/);
    assert.match(u, /after:/);
    assert.match(u, /worldwide|work from anywhere/i);
  });

  it("primary deeplinks always include LinkedIn, Indeed, Google, Glassdoor", () => {
    const links = buildDeepLinks(richFilters);
    const ids = new Set(links.map((l) => l.id));
    for (const id of ["linkedin", "indeed", "googlejobs", "glassdoor"]) {
      assert.ok(ids.has(id), `missing ${id}`);
    }
    const li = links.find((l) => l.id === "linkedin");
    const indeed = links.find((l) => l.id === "indeed");
    assert.ok(li.url.includes("f_E=4"));
    assert.ok(indeed.url.includes("ca.indeed.com"));
  });

  it("external hacks surface consolidated platforms first", () => {
    const { external } = applySearchHacks({ ...richFilters, applyHacks: true });
    const ids = external.map((e) => e.id);
    assert.ok(ids.includes("linkedin"));
    assert.ok(ids.includes("indeed"));
    assert.ok(ids.includes("googlejobs"));
    assert.ok(ids.includes("glassdoor"));
    assert.ok(ids.indexOf("linkedin") < ids.indexOf("apinfo") || !ids.includes("apinfo"));
  });

  it("multi-geo CSV still hits Indeed BR host for brazil", () => {
    const url = buildIndeedSearch({ keywords: "React", geo: "brazil,latam", recency: "24h", workplace: "remote" });
    assert.match(url, /br\.indeed\.com/);
    assert.match(url, /fromage=1/);
  });

  it("Portugal market maps LinkedIn location + Indeed PT host", () => {
    const li = buildLinkedInSearch({ keywords: "Java", geo: "portugal", workplace: "remote", recency: "3d" });
    const indeed = buildIndeedSearch({ keywords: "Java", geo: "portugal", workplace: "remote", recency: "3d" });
    assert.match(li, /geoId=100364837/);
    assert.match(indeed, /pt\.indeed\.com/);
  });
});
