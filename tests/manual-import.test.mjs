import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildExportPayload,
  parseManualExport,
  isManualExport,
  MANUAL_BRAND,
} from "../assets/js/manual-import/schema.js";
import {
  generateConsoleScript,
  buildSearchUrl,
} from "../assets/js/manual-import/script-generator.js";

describe("manual import schema", () => {
  it("builds and parses JSA export payload", () => {
    const payload = buildExportPayload({
      source: "linkedin",
      searchUrl: "https://www.linkedin.com/jobs/search/?keywords=.NET",
      filters: { keywords: ".NET", geo: "brazil" },
      jobs: [
        {
          id: "123",
          title: "Senior .NET Engineer",
          company: "Acme",
          location: "Brazil Remote",
          url: "https://www.linkedin.com/jobs/view/123",
          description: "C# Azure remote",
        },
      ],
    });
    assert.equal(payload.brand, MANUAL_BRAND);
    assert.equal(payload.schemaVersion, 1);
    assert.ok(isManualExport(payload));

    const parsed = parseManualExport(payload);
    assert.equal(parsed.jobs.length, 1);
    assert.equal(parsed.jobs[0].source, "linkedin");
    assert.match(parsed.jobs[0].title, /\.NET/i);
    assert.ok(parsed.jobs[0].url.includes("linkedin.com"));
  });

  it("accepts JobSpy-like arrays", () => {
    const parsed = parseManualExport([
      {
        title: "Backend Dev",
        company: "Co",
        job_url: "https://br.indeed.com/viewjob?jk=abc",
        location: "Remote",
      },
    ]);
    assert.equal(parsed.jobs.length, 1);
    assert.ok(parsed.jobs[0].url.includes("indeed"));
  });
});

describe("console script generator", () => {
  const filters = {
    keywords: ".NET C#",
    geo: "brazil",
    workplace: "remote",
    seniority: "senior",
    recency: "24h",
    jobType: "full-time",
  };

  it("builds LinkedIn search URL and script with DOM + guest API", () => {
    const url = buildSearchUrl("linkedin", filters);
    assert.match(url, /linkedin\.com\/jobs/);
    const { script, searchUrl } = generateConsoleScript("linkedin", filters, { maxJobs: 50 });
    assert.equal(searchUrl, url);
    assert.match(script, /JobSearchAggregator/);
    assert.match(script, /seeMoreJobPostings/);
    assert.match(script, /job-card-list__title|base-search-card__title/);
    assert.match(script, /MAX = 50/);
    assert.match(script, /download\(/);
  });

  it("builds Indeed and Glassdoor scripts", () => {
    const indeed = generateConsoleScript("indeed", filters, { maxJobs: 40 });
    assert.match(indeed.searchUrl, /indeed\./);
    assert.match(indeed.script, /job_seen_beacon|jcs-JobTitle/);

    const gd = generateConsoleScript("glassdoor", filters, { maxJobs: 40 });
    assert.match(gd.searchUrl, /glassdoor\./i);
    assert.match(gd.script, /jobListing|JobCard_/);
  });
});
