import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { defaultFilters, marketPreset, splitTerms } from "./filters.js";
import { searchJobs, ADAPTERS } from "./search-engine.js";
import { buildDeepLinks, groupDeepLinks } from "./sources/deeplinks.js";
import {
  OPERATOR_DOCS,
  SITE_HACKS,
  EXTRA_TIPS,
  buildSearchRecipes,
} from "./search-hacks.js";
import { loadEmpresas, filterCompanies, groupCompanies } from "./companies.js";

const SAVED_KEY = "jsa-saved";
const DEEP_PREVIEW_PER_GROUP = 4;

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

function loadSaved() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveSaved(set) {
  localStorage.setItem(SAVED_KEY, JSON.stringify([...set]));
}

let saved = loadSaved();
let lastJobs = [];
let deepExpanded = false;
let searching = false;
let allCompanies = [];

function readFilters() {
  const form = $("#filters-form");
  const fd = new FormData(form);
  const enabled = [...form.querySelectorAll('input[name="source"]:checked')].map(
    (el) => el.value
  );
  const str = (k, fallback = "") => String(fd.get(k) ?? fallback);
  const on = (k) => fd.get(k) === "on";
  return {
    market: str("market", "latam"),
    keywords: str("keywords"),
    exactPhrase: str("exactPhrase"),
    titleInclude: str("titleInclude"),
    titleExclude: str("titleExclude"),
    descInclude: str("descInclude"),
    descExclude: str("descExclude"),
    skillsMust: str("skillsMust"),
    skillsNice: str("skillsNice"),
    company: str("company"),
    hiddenCompanies: str("hiddenCompanies"),
    industry: str("industry"),
    recency: str("recency", "7d"),
    geo: str("geo", "any"),
    country: str("country", "any"),
    state: str("state"),
    city: str("city"),
    workplace: str("workplace", "any"),
    remotePolicy: str("remotePolicy", "any"),
    timezone: str("timezone", "any"),
    language: str("language", "any"),
    englishLevel: str("englishLevel", "any"),
    jobType: str("jobType", "any"),
    engagement: str("engagement", "any"),
    seniority: str("seniority", "any"),
    salaryMin: str("salaryMin"),
    salaryMax: str("salaryMax"),
    currency: str("currency", "any"),
    payPeriod: str("payPeriod", "any"),
    sponsorship: str("sponsorship", "any"),
    employerType: str("employerType", "any"),
    companyStage: str("companyStage", "any"),
    companySize: str("companySize", "any"),
    sortBy: str("sortBy", "recency"),
    easyApply: on("easyApply"),
    brazilOk: on("brazilOk"),
    latamOnly: on("latamOnly"),
    noAgency: on("noAgency"),
    strictSalary: on("strictSalary"),
    strictEligibility: on("strictEligibility"),
    strictCompany: on("strictCompany"),
    sources: enabled.length ? enabled : null,
  };
}

function setFormValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!value;
  else el.value = value ?? "";
}

function applyFilterObject(d) {
  const keys = [
    "market", "keywords", "exactPhrase", "titleInclude", "titleExclude",
    "descInclude", "descExclude", "skillsMust", "skillsNice", "company",
    "hiddenCompanies", "industry", "recency", "geo", "country", "state",
    "city", "workplace", "remotePolicy", "timezone", "language", "englishLevel",
    "jobType", "engagement", "seniority", "salaryMin", "salaryMax", "currency",
    "payPeriod", "sponsorship", "employerType", "companyStage", "companySize",
    "sortBy",
  ];
  for (const k of keys) setFormValue(k, d[k]);
  for (const k of [
    "easyApply", "brazilOk", "latamOnly", "noAgency",
    "strictSalary", "strictEligibility", "strictCompany",
  ]) {
    setFormValue(k, d[k]);
  }
  document.querySelectorAll("#market-presets .chip-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.market === d.market);
  });
}

function fillDefaults() {
  applyFilterObject(defaultFilters());
}

function applyMarket(market) {
  applyFilterObject(marketPreset(market));
  const f = readFilters();
  renderDeepLinks(f);
  renderHacks(f);
}

function renderSourceToggles() {
  const box = $("#source-toggles");
  box.innerHTML = ADAPTERS.map(
    (a) => `
    <label class="chip">
      <input type="checkbox" name="source" value="${a.id}" checked />
      ${a.name}
    </label>`
  ).join("");
}

function formatDate(ts) {
  if (!ts) return t("unknownDate");
  try {
    return new Intl.DateTimeFormat(getLang() === "pt" ? "pt-BR" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function highlight(text, filters) {
  const terms = [
    ...splitTerms(filters.keywords),
    ...splitTerms(filters.titleInclude),
    ...splitTerms(filters.descInclude),
  ].filter((term) => term.length > 1);
  let out = text.slice(0, 280);
  for (const term of terms.slice(0, 8)) {
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  if (text.length > 280) out += "…";
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function renderJobs(jobs, filters) {
  lastJobs = jobs;
  const list = $("#job-list");
  $("#results-count").textContent = `${jobs.length} ${t("jobsFound")}`;

  if (!jobs.length) {
    list.innerHTML = `<div class="empty">${t("noResults")}</div>`;
    return;
  }

  list.innerHTML = jobs
    .slice(0, 250)
    .map((job) => {
      const isSaved = saved.has(job.url);
      const badges = [
        `<span class="badge source">${job.source}</span>`,
        job.workplace !== "unknown"
          ? `<span class="badge">${job.workplace}</span>`
          : "",
        job.jobType !== "unknown"
          ? `<span class="badge">${job.jobType}</span>`
          : "",
        job.engagement !== "unknown"
          ? `<span class="badge">${job.engagement}</span>`
          : "",
        job.language !== "unknown"
          ? `<span class="badge">${job.language.toUpperCase()}</span>`
          : "",
        job.remotePolicy === "anywhere" || job.remotePolicy === "brazil-ok"
          ? `<span class="badge latam">${job.remotePolicy}</span>`
          : "",
        job.geo?.latamFriendly || job.geo?.brazil
          ? `<span class="badge latam">LATAM/BR</span>`
          : "",
        job.sponsorship === "yes"
          ? `<span class="badge">visa</span>`
          : "",
        job.location ? `<span class="badge">${escapeHtml(job.location)}</span>` : "",
        job.salary ? `<span class="badge">${escapeHtml(job.salary)}</span>` : "",
      ]
        .filter(Boolean)
        .join("");

      return `
      <article class="job-row" data-url="${escapeAttr(job.url)}">
        <div>
          <h3 class="job-title"><a href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h3>
          <div class="job-meta">${escapeHtml(job.company)} · ${t("posted")} ${formatDate(job.postedAt)}</div>
          <div class="badges">${badges}</div>
          <div class="job-snippet">${highlight(job.description || "", filters)}</div>
        </div>
        <div class="job-actions">
          <a class="btn btn-small btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${t("open")}</a>
          <button type="button" class="btn btn-small btn-ghost btn-copy">${t("copy")}</button>
          <button type="button" class="btn btn-small btn-ghost btn-save" data-saved="${isSaved}">${isSaved ? t("unsave") : t("save")}</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderProgress(p) {
  const wrap = $("#progress-wrap");
  wrap.hidden = false;
  $("#progress-fill").style.width = `${p.percent}%`;
  $("#progress-fill").parentElement.setAttribute("aria-valuenow", String(p.percent));
  $("#progress-label").textContent =
    p.percent >= 100
      ? `${t("done")} · ${p.done}/${p.total}`
      : `${t("loading")} ${p.done}/${p.total} · ${p.percent}%`;
  $("#progress-eta").textContent =
    p.percent >= 100 ? "" : `${t("eta")} ~${Math.ceil((p.etaMs || 0) / 1000)}s`;

  const box = $("#source-status");
  box.innerHTML = Object.values(p.sources || {})
    .map((s) => {
      const stateLabel = t(s.state) || s.state;
      const detail =
        s.state === "error"
          ? s.error
          : s.state === "ok" || s.state === "empty"
            ? `${s.count} · ${s.ms}ms`
            : stateLabel;
      return `<div class="source-pill" data-state="${s.state}"><strong>${s.name}</strong>${stateLabel}${detail && detail !== stateLabel ? ` · ${escapeHtml(detail)}` : ""}</div>`;
    })
    .join("");
}

function groupLabel(key) {
  const map = {
    primary: "groupPrimary",
    brazil: "groupBrazil",
    worldwide: "groupWorldwide",
    "us-br": "groupUsBr",
    "eu-br": "groupEuBr",
    "au-br": "groupAuBr",
    latam: "regionLatam",
    bookmark: "regionBookmark",
    featured: "regionFeatured",
  };
  return t(map[key] || key);
}

function renderDeepLinks(filters) {
  const links = buildDeepLinks(filters);
  const groups = groupDeepLinks(links);
  const root = $("#deeplink-groups");
  root.innerHTML = groups
    .map((g) => {
      const shown = deepExpanded ? g.links : g.links.slice(0, DEEP_PREVIEW_PER_GROUP);
      return `
      <div class="link-group">
        <h3 class="subhead">${groupLabel(g.id)} <span class="muted">(${g.links.length})</span></h3>
        <div class="deeplink-grid">
          ${shown
            .map(
              (l) => `
            <a class="deeplink" href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">
              <strong>${escapeHtml(l.name)}</strong>
              <span>${escapeHtml(l.description)}</span>
            </a>`
            )
            .join("")}
        </div>
      </div>`;
    })
    .join("");
  $("#btn-toggle-deep").textContent = deepExpanded ? t("showLess") : t("showMore");
}

function renderCompanies() {
  const q = $("#company-q")?.value || "";
  const region = $("#company-region")?.value || "any";
  const type = $("#company-type")?.value || "any";
  const filtered = filterCompanies(allCompanies, { q, region, type });
  $("#companies-count").textContent = `${filtered.length} ${t("companiesFound")}`;
  const groups = groupCompanies(filtered);
  const root = $("#companies-groups");
  if (!groups.length) {
    root.innerHTML = `<div class="empty">${t("noResults")}</div>`;
    return;
  }
  root.innerHTML = groups
    .map(
      (g) => `
    <div class="link-group">
      <h3 class="subhead">${groupLabel(g.id)} <span class="muted">(${g.companies.length})</span></h3>
      <div class="deeplink-grid">
        ${g.companies
          .map((c) => {
            const href = c.searchUrl || c.url;
            const star = c.featured ? " ★" : "";
            const note = c.note ? escapeHtml(c.note) : `${escapeHtml(c.type || "")} · ${escapeHtml(c.host || "")}`;
            return `
          <a class="deeplink${c.featured ? " featured" : ""}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(c.name)}${star}</strong>
            <span>${note}</span>
          </a>`;
          })
          .join("")}
      </div>
    </div>`
    )
    .join("");
}

function renderHacks(filters) {
  const opsRoot = $("#hacks-ops");
  const sections = [
    ["hacksGoogle", OPERATOR_DOCS.google],
    ["hacksLinkedIn", OPERATOR_DOCS.linkedin],
    ["hacksIndeed", OPERATOR_DOCS.indeed],
  ];
  opsRoot.innerHTML = sections
    .map(
      ([titleKey, ops]) => `
    <div class="ops-block">
      <h3 class="subhead">${t(titleKey)}</h3>
      <div class="ops-list">
        ${ops
          .map(
            (o) => `
          <div class="op-row">
            <code>${escapeHtml(o.op)}</code>
            <span>${t(o.tipKey)}</span>
          </div>`
          )
          .join("")}
      </div>
    </div>`
    )
    .join("");

  $("#site-hacks").innerHTML = SITE_HACKS.map(
    (s) => `
    <div class="ops-block">
      <h3 class="subhead"><a href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a></h3>
      <ul class="tips-list compact">
        ${s.tips.map((tip) => `<li>${t(tip)}</li>`).join("")}
      </ul>
    </div>`
  ).join("");

  const recipes = buildSearchRecipes(filters);
  $("#recipes").innerHTML = recipes
    .map(
      (r) => `
    <article class="recipe-row" data-query="${escapeAttr(r.query)}" data-url="${escapeAttr(r.url)}">
      <div>
        <div class="recipe-platform">${escapeHtml(r.platform)}</div>
        <strong>${t(r.titleKey)}</strong>
        <pre class="recipe-query">${escapeHtml(r.query)}</pre>
      </div>
      <div class="job-actions">
        <a class="btn btn-small btn-primary" href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer">${t("openRecipe")}</a>
        <button type="button" class="btn btn-small btn-ghost btn-copy-query">${t("copyQuery")}</button>
      </div>
    </article>`
    )
    .join("");

  $("#extra-tips").innerHTML = EXTRA_TIPS.map((tip) => `<li>${t(tip)}</li>`).join("");
}

async function runSearch() {
  if (searching) return;
  searching = true;
  const filters = readFilters();
  renderDeepLinks(filters);
  renderHacks(filters);
  $("#btn-search").disabled = true;

  try {
    const { jobs } = await searchJobs(filters, renderProgress, filters.sources);
    renderJobs(jobs, filters);
  } finally {
    searching = false;
    $("#btn-search").disabled = false;
  }
}

function wireEvents() {
  $("#filters-form").addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch();
  });
  $("#btn-search").addEventListener("click", () => runSearch());
  $("#btn-deeplinks").addEventListener("click", () => {
    renderDeepLinks(readFilters());
    $("#deeplinks-panel").scrollIntoView({ behavior: "smooth" });
  });
  $("#btn-companies").addEventListener("click", () => {
    renderCompanies();
    $("#companies-panel").scrollIntoView({ behavior: "smooth" });
  });
  $("#btn-hacks").addEventListener("click", () => {
    renderHacks(readFilters());
    $("#hacks-panel").scrollIntoView({ behavior: "smooth" });
  });
  $("#btn-reset").addEventListener("click", () => {
    $("#filters-form").reset();
    fillDefaults();
    renderSourceToggles();
    const f = readFilters();
    renderDeepLinks(f);
    renderHacks(f);
  });

  document.querySelectorAll("#market-presets .chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyMarket(btn.dataset.market));
  });
  $("#btn-toggle-deep").addEventListener("click", () => {
    deepExpanded = !deepExpanded;
    renderDeepLinks(readFilters());
  });
  $("#btn-clear-saved").addEventListener("click", () => {
    saved = new Set();
    saveSaved(saved);
    if (lastJobs.length) renderJobs(lastJobs, readFilters());
  });

  ["company-q", "company-region", "company-type"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", renderCompanies);
    el?.addEventListener("change", renderCompanies);
  });

  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      document.querySelectorAll(".lang-switch button").forEach((b) => {
        b.classList.toggle("active", b.dataset.lang === getLang());
      });
      document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
      applyI18n();
      const f = readFilters();
      renderDeepLinks(f);
      renderHacks(f);
      renderCompanies();
      if (lastJobs.length) renderJobs(lastJobs, f);
    });
  });

  $("#job-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".job-row");
    if (!row) return;
    const url = row.dataset.url;
    if (e.target.classList.contains("btn-copy")) {
      try {
        await navigator.clipboard.writeText(url);
        toast(t("copyOk"));
      } catch {
        toast(url);
      }
    }
    if (e.target.classList.contains("btn-save")) {
      if (saved.has(url)) saved.delete(url);
      else saved.add(url);
      saveSaved(saved);
      e.target.dataset.saved = saved.has(url);
      e.target.textContent = saved.has(url) ? t("unsave") : t("save");
    }
  });

  $("#recipes").addEventListener("click", async (e) => {
    if (!e.target.classList.contains("btn-copy-query")) return;
    const row = e.target.closest(".recipe-row");
    if (!row) return;
    try {
      await navigator.clipboard.writeText(row.dataset.query);
      toast(t("copyOk"));
    } catch {
      toast(row.dataset.query);
    }
  });

  $("#filters-form").addEventListener("change", () => {
    const f = readFilters();
    renderDeepLinks(f);
    renderHacks(f);
  });
}

async function boot() {
  initLang();
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  document.querySelectorAll(".lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === getLang());
  });
  renderSourceToggles();
  fillDefaults();
  applyI18n();
  const f = readFilters();
  renderDeepLinks(f);
  renderHacks(f);
  wireEvents();

  try {
    const data = await loadEmpresas();
    allCompanies = data.companies || [];
    renderCompanies();
  } catch (err) {
    $("#companies-groups").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

boot();
