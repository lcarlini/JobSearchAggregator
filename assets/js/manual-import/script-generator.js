/**
 * Generate paste-into-DevTools console scrapers for boards without public APIs.
 * Pattern inspired by console-first scrapers (withLinda/LinkedIn-profile-scraper-extended)
 * and guest seeMoreJobPostings pagination used by open LinkedIn job scrapers.
 *
 * Runs only in the user's browser session — no server-side scrape.
 */
import {
  buildLinkedInSearch,
  buildIndeedSearch,
  buildGlassdoorSearch,
} from "../sources/deeplinks.js";
import { MANUAL_BRAND, MANUAL_SCHEMA_VERSION } from "./schema.js";

function esc(s) {
  return JSON.stringify(s ?? "");
}

function commonHelpers() {
  return `
  const BRAND = ${esc(MANUAL_BRAND)};
  const SCHEMA = ${MANUAL_SCHEMA_VERSION};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el && (el.innerText || el.textContent) || "").replace(/\\s+/g, " ").trim();
  const absUrl = (href) => {
    try { return href ? new URL(href, location.origin).href.split("?")[0] : ""; }
    catch { return href || ""; }
  };
  function download(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  function toast(msg) {
    let el = document.getElementById("jsa-scrape-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "jsa-scrape-toast";
      el.style.cssText = "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;border-radius:12px;background:#0b1220;color:#e8eef8;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45);border:1px solid rgba(92,200,255,.35)";
      document.body.appendChild(el);
    }
    el.textContent = msg;
  }
  function finish(source, jobs, searchUrl, filters, meta) {
    const payload = {
      schemaVersion: SCHEMA,
      brand: BRAND,
      source,
      generatedAt: new Date().toISOString(),
      searchUrl,
      filters,
      meta: { count: jobs.length, ...(meta || {}) },
      jobs,
    };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    download("jsa-" + source + "-" + stamp + ".json", payload);
    toast("JSA: " + jobs.length + " vagas → arquivo baixado. Faça upload em manual.html");
    console.log("[JSA] export", payload);
    return payload;
  }
`;
}

function linkedInScript(filters, searchUrl, maxJobs) {
  return `/* JobSearchAggregator · LinkedIn console scraper
 * 1) Abra: ${searchUrl}
 * 2) F12 → Console → cole este script → Enter
 * Uso pessoal na sua sessão logada. Respeite o ToS do LinkedIn.
 */
(async () => {
${commonHelpers()}
  const FILTERS = ${JSON.stringify(filters)};
  const MAX = ${Number(maxJobs) || 120};
  const SEARCH_URL = ${esc(searchUrl)};

  if (!/linkedin\\.com/i.test(location.hostname)) {
    alert("Abra o LinkedIn Jobs primeiro:\\n" + SEARCH_URL);
    location.href = SEARCH_URL;
    return;
  }

  toast("JSA LinkedIn: coletando…");
  const byId = new Map();

  function addJob(j) {
    if (!j || !j.title || !j.url) return;
    const id = String(j.id || j.url);
    if (byId.has(id)) return;
    byId.set(id, {
      id,
      title: j.title,
      company: j.company || "—",
      location: j.location || "Remote",
      url: absUrl(j.url),
      description: j.description || "",
      postedAt: j.postedAt || null,
      source: "linkedin",
    });
  }

  function scrapeDom() {
    const cards = document.querySelectorAll([
      "li.jobs-search-results__list-item",
      "div.job-card-container",
      "div.base-card",
      "div.job-search-card",
      "li.scaffold-layout__list-item",
    ].join(","));
    cards.forEach((card) => {
      const urn = card.getAttribute("data-entity-urn")
        || card.getAttribute("data-job-id")
        || card.querySelector("[data-entity-urn]")?.getAttribute("data-entity-urn")
        || "";
      const idMatch = String(urn).match(/(\\d{6,})/);
      const id = idMatch ? idMatch[1] : (card.getAttribute("data-occludable-job-id") || "");
      const titleEl = card.querySelector([
        "a.job-card-list__title--link",
        "a.job-card-container__link",
        ".job-card-list__title",
        ".base-search-card__title",
        "a.base-card__full-link",
        "a[href*='/jobs/view/']",
      ].join(","));
      const companyEl = card.querySelector([
        ".job-card-container__primary-description",
        ".job-card-container__company-name",
        ".artdeco-entity-lockup__subtitle",
        ".base-search-card__subtitle",
        "h4.base-search-card__subtitle",
      ].join(","));
      const locEl = card.querySelector([
        ".job-card-container__metadata-item",
        ".job-search-card__location",
        ".artdeco-entity-lockup__caption",
        ".job-card-container__metadata-wrapper li",
      ].join(","));
      const timeEl = card.querySelector("time");
      let href = titleEl?.getAttribute("href") || card.querySelector("a[href*='/jobs/view/']")?.href || "";
      if (id && !href) href = "https://www.linkedin.com/jobs/view/" + id;
      addJob({
        id: id || absUrl(href),
        title: text(titleEl),
        company: text(companyEl),
        location: text(locEl),
        url: href,
        postedAt: timeEl?.getAttribute("datetime") || text(timeEl) || null,
        description: text(card.querySelector(".job-card-list__insight, .job-card-container__footer-item")),
      });
    });
  }

  async function scrollList() {
    const scroller = document.querySelector(
      ".jobs-search-results-list, .scaffold-layout__list > div, .jobs-search__results-list"
    ) || document.scrollingElement;
    for (let i = 0; i < 28 && byId.size < MAX; i++) {
      scrapeDom();
      toast("JSA LinkedIn: " + byId.size + " vagas (scroll " + (i + 1) + ")");
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollBy(0, 1200);
      await sleep(700 + Math.random() * 500);
      const more = document.querySelector(
        "button.infinite-scroller__show-more-button, button.artdeco-button--muted[aria-label*='Show more'], button.artdeco-button--muted[aria-label*='Mostrar']"
      );
      if (more) {
        try { more.click(); } catch {}
        await sleep(900);
      }
    }
    scrapeDom();
  }

  async function fetchGuestPages() {
    try {
      const u = new URL(location.href);
      const params = new URLSearchParams(u.search);
      const keywords = params.get("keywords") || FILTERS.keywords || "";
      const location = params.get("location") || "";
      const geoId = params.get("geoId") || "";
      const f_TPR = params.get("f_TPR") || "";
      const f_WT = params.get("f_WT") || "";
      const f_E = params.get("f_E") || "";
      const f_JT = params.get("f_JT") || "";
      for (let start = 0; start < MAX && byId.size < MAX; start += 25) {
        const api = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
        if (keywords) api.searchParams.set("keywords", keywords);
        if (location) api.searchParams.set("location", location);
        if (geoId) api.searchParams.set("geoId", geoId);
        if (f_TPR) api.searchParams.set("f_TPR", f_TPR);
        if (f_WT) api.searchParams.set("f_WT", f_WT);
        if (f_E) api.searchParams.set("f_E", f_E);
        if (f_JT) api.searchParams.set("f_JT", f_JT);
        api.searchParams.set("start", String(start));
        const res = await fetch(api.toString(), {
          credentials: "include",
          headers: { Accept: "text/html", "x-requested-with": "XMLHttpRequest" },
        });
        if (!res.ok) break;
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const cards = doc.querySelectorAll(".base-card, .job-search-card, li");
        let added = 0;
        cards.forEach((card) => {
          const urn = card.getAttribute("data-entity-urn") || "";
          const id = urn.split(":").pop();
          const titleEl = card.querySelector(".base-search-card__title, a");
          const companyEl = card.querySelector(".base-search-card__subtitle");
          const locEl = card.querySelector(".job-search-card__location");
          const link = card.querySelector("a.base-card__full-link, a[href*='/jobs/view/']");
          const before = byId.size;
          addJob({
            id,
            title: text(titleEl),
            company: text(companyEl),
            location: text(locEl),
            url: link?.getAttribute("href") || (id ? "https://www.linkedin.com/jobs/view/" + id : ""),
            postedAt: card.querySelector("time")?.getAttribute("datetime") || null,
          });
          if (byId.size > before) added++;
        });
        toast("JSA LinkedIn API: start=" + start + " · total " + byId.size);
        if (added === 0 && start > 0) break;
        await sleep(900 + Math.random() * 600);
      }
    } catch (e) {
      console.warn("[JSA] guest API", e);
    }
  }

  await scrollList();
  if (byId.size < Math.min(40, MAX)) await fetchGuestPages();
  const jobs = [...byId.values()].slice(0, MAX);
  return finish("linkedin", jobs, location.href, FILTERS, { method: "dom+guest-api" });
})();`;
}

function indeedScript(filters, searchUrl, maxJobs) {
  return `/* JobSearchAggregator · Indeed console scraper
 * 1) Abra: ${searchUrl}
 * 2) F12 → Console → cole → Enter
 */
(async () => {
${commonHelpers()}
  const FILTERS = ${JSON.stringify(filters)};
  const MAX = ${Number(maxJobs) || 100};
  const SEARCH_URL = ${esc(searchUrl)};

  if (!/indeed\\./i.test(location.hostname)) {
    alert("Abra o Indeed primeiro:\\n" + SEARCH_URL);
    location.href = SEARCH_URL;
    return;
  }

  toast("JSA Indeed: coletando…");
  const byId = new Map();

  function scrape() {
    const cards = document.querySelectorAll([
      "div.job_seen_beacon",
      "li.css-5lfssg",
      "div.slider_container div.slider_item",
      "td.resultContent",
      "div[data-jk]",
      ".jobsearch-ResultsList > li",
    ].join(","));
    cards.forEach((card) => {
      const root = card.closest("[data-jk]") || card;
      const jk = root.getAttribute("data-jk")
        || root.querySelector("[data-jk]")?.getAttribute("data-jk")
        || "";
      const titleEl = root.querySelector("h2.jobTitle a, a.jcs-JobTitle, h2 a[data-jk], .jobTitle a");
      const companyEl = root.querySelector("[data-testid='company-name'], .companyName, span.companyName");
      const locEl = root.querySelector("[data-testid='text-location'], .companyLocation");
      const salEl = root.querySelector(".salary-snippet, .estimated-salary, [data-testid='attribute_snippet_testid']");
      const snipEl = root.querySelector(".job-snippet, [data-testid='job-snippet']");
      const href = titleEl?.href || (jk ? location.origin + "/viewjob?jk=" + jk : "");
      const title = text(titleEl);
      if (!title || !href) return;
      const id = jk || href;
      if (byId.has(id)) return;
      byId.set(id, {
        id,
        title,
        company: text(companyEl) || "—",
        location: text(locEl) || "Remote",
        url: absUrl(href),
        description: text(snipEl),
        salary: text(salEl) || null,
        postedAt: text(root.querySelector(".date, [data-testid='myJobsStateDate']")) || null,
        source: "indeed",
      });
    });
  }

  for (let page = 0; page < 12 && byId.size < MAX; page++) {
    scrape();
    toast("JSA Indeed: " + byId.size + " vagas (pág " + (page + 1) + ")");
    window.scrollBy(0, 1600);
    await sleep(600);
    const next = document.querySelector("a[data-testid='pagination-page-next'], a[aria-label='Next Page'], a[aria-label='Próxima']");
    if (!next || next.getAttribute("aria-disabled") === "true") break;
    next.click();
    await sleep(1800 + Math.random() * 800);
  }
  scrape();
  return finish("indeed", [...byId.values()].slice(0, MAX), location.href, FILTERS, { method: "dom" });
})();`;
}

function glassdoorScript(filters, searchUrl, maxJobs) {
  return `/* JobSearchAggregator · Glassdoor console scraper
 * 1) Abra: ${searchUrl}
 * 2) F12 → Console → cole → Enter
 */
(async () => {
${commonHelpers()}
  const FILTERS = ${JSON.stringify(filters)};
  const MAX = ${Number(maxJobs) || 80};
  const SEARCH_URL = ${esc(searchUrl)};

  if (!/glassdoor\\./i.test(location.hostname)) {
    alert("Abra o Glassdoor primeiro:\\n" + SEARCH_URL);
    location.href = SEARCH_URL;
    return;
  }

  toast("JSA Glassdoor: coletando…");
  const byId = new Map();

  function scrape() {
    const cards = document.querySelectorAll([
      "li[data-test='jobListing']",
      "li.react-job-listing",
      "div.JobCard_jobCardContainer__",
      "article[data-test='job-card']",
      "li.JobsList_jobListItem__",
    ].join(","));
    cards.forEach((card) => {
      const titleEl = card.querySelector([
        "a[data-test='job-title']",
        "a.JobCard_jobTitle__",
        "[data-test='job-link']",
        "a[href*='/job-listing/']",
        "a[href*='/Partner/jobListing']",
      ].join(","));
      const companyEl = card.querySelector([
        "[data-test='employer-name']",
        ".EmployerProfile_employerName__",
        ".JobCard_employerName__",
      ].join(","));
      const locEl = card.querySelector([
        "[data-test='emp-location']",
        ".JobCard_location__",
        "[data-test='employee-location']",
      ].join(","));
      const salEl = card.querySelector("[data-test='detailSalary'], .JobCard_salaryEstimate__");
      const href = titleEl?.href || "";
      const title = text(titleEl);
      if (!title || !href) return;
      const id = href;
      if (byId.has(id)) return;
      byId.set(id, {
        id,
        title,
        company: text(companyEl) || "—",
        location: text(locEl) || "Remote",
        url: absUrl(href),
        description: text(card.querySelector("[data-test='job-description'], .JobCard_jobDescriptionSnippet__")),
        salary: text(salEl) || null,
        postedAt: text(card.querySelector("[data-test='job-age'], .JobCard_listingAge__")) || null,
        source: "glassdoor",
      });
    });
  }

  for (let i = 0; i < 20 && byId.size < MAX; i++) {
    scrape();
    toast("JSA Glassdoor: " + byId.size + " vagas");
    window.scrollBy(0, 1400);
    await sleep(700);
    const next = document.querySelector("button[data-test='pagination-next'], button[aria-label*='Next']");
    if (next && !next.disabled) {
      next.click();
      await sleep(1600);
    }
  }
  scrape();
  return finish("glassdoor", [...byId.values()].slice(0, MAX), location.href, FILTERS, { method: "dom" });
})();`;
}

/**
 * @param {'linkedin'|'indeed'|'glassdoor'} source
 * @param {object} filters
 * @param {{ maxJobs?: number }} [opts]
 */
export function buildSearchUrl(source, filters) {
  if (source === "indeed") return buildIndeedSearch(filters);
  if (source === "glassdoor") return buildGlassdoorSearch(filters);
  return buildLinkedInSearch(filters);
}

export function generateConsoleScript(source, filters, opts = {}) {
  const maxJobs = opts.maxJobs || 120;
  const searchUrl = buildSearchUrl(source, filters);
  if (source === "indeed") return { searchUrl, script: indeedScript(filters, searchUrl, maxJobs) };
  if (source === "glassdoor") return { searchUrl, script: glassdoorScript(filters, searchUrl, maxJobs) };
  return { searchUrl, script: linkedInScript(filters, searchUrl, maxJobs) };
}
