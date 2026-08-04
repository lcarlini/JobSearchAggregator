import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseWorkdayUrl, normalizeWorkdayBoard, workdayJobsUrl } from "../scripts/lib/workday.mjs";
import { parseAtsUrl } from "../scripts/lib/ats-url-parse.mjs";
import { classifyCompany, normalizeCompanyName } from "../scripts/lib/company-classify.mjs";
import { buildDeepLinks } from "../assets/js/sources/deeplinks.js";
import { careerLinksForFilters } from "../assets/js/sources/company-careers.js";

describe("workday URL parse", () => {
  it("parses CSG myworkdayjobs URL", () => {
    const b = parseWorkdayUrl(
      "https://csgi.wd5.myworkdayjobs.com/CSGCareers/job/Brazil-Remote/Software-Dev-II_32238?source=LinkedIn"
    );
    assert.equal(b.tenant, "csgi");
    assert.equal(b.site, "CSGCareers");
    assert.equal(b.host, "csgi.wd5.myworkdayjobs.com");
    assert.match(workdayJobsUrl(b), /\/wday\/cxs\/csgi\/CSGCareers\/jobs$/);
  });

  it("parses Fidelity myworkdaysite recruiting URL", () => {
    const b = parseWorkdayUrl(
      "https://wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers/job/Dublin-Ireland/x"
    );
    assert.equal(b.tenant, "fmr");
    assert.equal(b.site, "FidelityCareers");
  });

  it("parseAtsUrl routes workday", () => {
    const p = parseAtsUrl("https://planet.wd3.myworkdayjobs.com/en-US/Planet");
    assert.equal(p.ats, "workday");
    assert.equal(p.board.site, "Planet");
  });
});

describe("linkedin seed classify", () => {
  it("classifies boards vs employers", () => {
    assert.equal(classifyCompany("We Work Remotely").kind, "board");
    assert.equal(classifyCompany("iFood").kind, "employer");
    assert.equal(classifyCompany("Robert Half").kind, "agency");
    assert.equal(classifyCompany("Freelance | Self-Employed").kind, "skip");
  });

  it("seed file exists with employers", () => {
    const seed = JSON.parse(fs.readFileSync("data/linkedin-companies-seed.json", "utf8"));
    assert.ok(seed.stats.total >= 100);
    assert.ok(seed.stats.employer >= 50);
  });

  it("companies.json has workday boards", () => {
    const c = JSON.parse(fs.readFileSync("data/companies.json", "utf8"));
    assert.ok(Array.isArray(c.workday));
    assert.ok(c.workday.some((b) => normalizeWorkdayBoard(b)?.id === "csgi/CSGCareers"));
  });
});

describe("company career deeplinks", () => {
  it("surfaces CSG and LATAM careers in deep links", () => {
    const links = buildDeepLinks({ keywords: ".NET", geo: "brazil", workplace: "remote" });
    assert.ok(links.some((l) => l.id === "career-csg-workday"));
    assert.ok(links.some((l) => l.group === "careers"));
    const pack = careerLinksForFilters({ geo: "brazil" });
    assert.ok(pack.length >= 5);
  });

  it("normalizeCompanyName strips Company suffix", () => {
    assert.equal(normalizeCompanyName("Halian, CompanyHalian"), "Halian");
  });
});
