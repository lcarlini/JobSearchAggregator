import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { defaultFilters, splitTerms } from "./filters.js";
import { searchJobs, ADAPTERS } from "./search-engine.js";
import { applySearchHacks } from "./apply-hacks.js";
import { SEARCH_PRESETS } from "./presets.js";

const SAVED_KEY = "jsa-saved";
const PAGE_SIZE = 40;

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
let lastExternal = [];
let lastMeta = { sourcesOk: 0, elapsedMs: 0, hacks: [] };
let visibleCount = PAGE_SIZE;
let searching = false;

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
    applyHacks: on("applyHacks"),
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

/** Sync hidden inputs from active multi-select chips (OR semantics). */
function syncMultiChip(name) {
  const active = [
    ...document.querySelectorAll(`.chip-btn.active[data-multi="${name}"]`),
  ].map((b) => b.dataset.value);
  const hidden = document.getElementById(name);
  if (!hidden) return;
  if (!active.length) {
    hidden.value = name === "geo" ? "any" : "any";
  } else {
    hidden.value = active.join(",");
  }
  if (name === "geo") {
    const market = document.getElementById("market");
    if (market) market.value = active[0] || "latam";
  }
}

function syncAllMultiChips() {
  for (const name of ["geo", "workplace", "seniority", "jobType"]) syncMultiChip(name);
}

function setMultiChips(name, value) {
  const wanted = new Set(
    String(value || "any")
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && s !== "any")
  );
  document.querySelectorAll(`.chip-btn[data-multi="${name}"]`).forEach((btn) => {
    btn.classList.toggle("active", wanted.has(String(btn.dataset.value).toLowerCase()));
  });
  // Defaults: geo=latam, workplace=remote when empty after apply
  if (!wanted.size && name === "geo") {
    document
      .querySelector('.chip-btn[data-multi="geo"][data-value="latam"]')
      ?.classList.add("active");
  }
  if (!wanted.size && name === "workplace") {
    document
      .querySelector('.chip-btn[data-multi="workplace"][data-value="remote"]')
      ?.classList.add("active");
  }
  syncMultiChip(name);
}

function applyFilterObject(d) {
  const keys = [
    "market", "keywords", "exactPhrase", "titleInclude", "titleExclude",
    "descInclude", "descExclude", "skillsMust", "skillsNice", "company",
    "hiddenCompanies", "industry", "recency", "country", "state",
    "city", "remotePolicy", "timezone", "language", "englishLevel",
    "engagement", "salaryMin", "salaryMax", "currency",
    "payPeriod", "sponsorship", "employerType", "companyStage", "companySize",
    "sortBy",
  ];
  for (const k of keys) setFormValue(k, d[k]);
  for (const k of [
    "easyApply", "applyHacks", "brazilOk", "latamOnly", "noAgency",
    "strictSalary", "strictEligibility", "strictCompany",
  ]) {
    setFormValue(k, d[k]);
  }
  setMultiChips("geo", d.geo || d.market || "latam");
  setMultiChips("workplace", d.workplace || "remote");
  setMultiChips("seniority", d.seniority || "any");
  setMultiChips("jobType", d.jobType || "any");
}

function fillDefaults() {
  applyFilterObject(defaultFilters());
}

function renderSourceToggles() {
  const box = $("#source-toggles");
  if (!box) return;
  box.innerHTML = ADAPTERS.map(
    (a) => `
    <label class="chip">
      <input type="checkbox" name="source" value="${a.id}" checked />
      ${a.name}
    </label>`
  ).join("");
}

function renderPresets() {
  $("#presets-grid").innerHTML = SEARCH_PRESETS.map(
    (p) => `
    <button type="button" class="preset-card" data-preset="${p.id}">
      <strong>${t(p.titleKey)}</strong>
      <span>${t(p.descKey)}</span>
    </button>`
  ).join("");
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

function formatDate(ts) {
  if (!ts) return t("unknownDate");
  try {
    return new Intl.DateTimeFormat(getLang() === "pt" ? "pt-BR" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

function highlight(text, filters) {
  const terms = [
    ...splitTerms(filters.keywords),
    ...splitTerms(filters.titleInclude),
  ].filter((term) => term.length > 1);
  let out = text.slice(0, 220);
  for (const term of terms.slice(0, 6)) {
    const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  if (text.length > 220) out += "…";
  return out;
}

function updateStats() {
  const bar = $("#stats-bar");
  bar.hidden = false;
  $("#stat-total").textContent = String(lastJobs.length);
  $("#stat-sources").textContent = String(lastMeta.sourcesOk || 0);
  $("#stat-time").textContent =
    lastMeta.elapsedMs != null ? `${(lastMeta.elapsedMs / 1000).toFixed(1)}s` : "—";
  $("#stat-showing").textContent = String(Math.min(visibleCount, lastJobs.length));
}

function renderExternalBoards(external = []) {
  const box = $("#external-boards");
  if (!box) return;
  const primary = external.filter((e) =>
    /linkedin|indeed|apinfo|google|remotar/i.test(`${e.id} ${e.name}`)
  );
  const list = (primary.length ? primary : external).slice(0, 6);
  if (!list.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="external-boards-label">${t("externalBoardsTitle")}</div>
    <p class="external-boards-hint">${t("externalBoardsHint")}</p>
    <div class="deeplink-grid">
      ${list
        .map(
          (e) => `
        <a class="deeplink${/linkedin|apinfo/i.test(`${e.id}${e.name}`) ? " featured" : ""}" href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer">
          <strong>${escapeHtml(e.name)}</strong>
          <span>${escapeHtml(e.query || e.description || t("externalOpen"))}</span>
        </a>`
        )
        .join("")}
    </div>`;
}

function renderJobs(jobs, filters, external = lastExternal) {
  lastJobs = jobs;
  if (external?.length) lastExternal = external;
  const list = $("#job-list");
  const showing = jobs.slice(0, visibleCount);
  updateStats();
  renderExternalBoards(lastExternal);

  const moreWrap = $("#load-more-wrap");
  moreWrap.hidden = jobs.length <= visibleCount;
  $("#btn-load-more").textContent =
    jobs.length > visibleCount
      ? `${t("showAllJobs")} (${jobs.length})`
      : t("showAllJobs");

  if (!jobs.length) {
    list.innerHTML = `<div class="empty">${t("noResults")}</div>`;
    return;
  }

  list.innerHTML = showing
    .map((job, idx) => {
      const isSaved = saved.has(job.url);
      const badges = [
        `<span class="badge source">${escapeHtml(job.source)}</span>`,
        job.workplace !== "unknown" ? `<span class="badge">${job.workplace}</span>` : "",
        job.jobType !== "unknown" ? `<span class="badge">${job.jobType}</span>` : "",
        job.geo?.latamFriendly || job.geo?.brazil
          ? `<span class="badge latam">LATAM/BR</span>`
          : "",
        job.salary ? `<span class="badge">${escapeHtml(job.salary)}</span>` : "",
      ]
        .filter(Boolean)
        .join("");

      return `
      <article class="job-row" data-url="${escapeAttr(job.url)}">
        <div class="job-index">${idx + 1}</div>
        <div class="job-body">
          <h3 class="job-title"><a href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h3>
          <div class="job-meta">${escapeHtml(job.company)} · ${formatDate(job.postedAt)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</div>
          <div class="badges">${badges}</div>
          <div class="job-snippet">${highlight(job.description || "", filters)}</div>
        </div>
        <div class="job-actions">
          <a class="btn btn-small btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${t("open")}</a>
          <button type="button" class="btn btn-small btn-ghost btn-copy">${t("copy")}</button>
          <button type="button" class="btn btn-small btn-ghost btn-save">${isSaved ? t("unsave") : t("save")}</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderProgress(p) {
  const wrap = $("#progress-wrap");
  wrap.hidden = false;
  $("#progress-fill").style.width = `${p.percent}%`;
  $("#progress-label").textContent =
    p.percent >= 100
      ? `${t("done")} · ${p.done}/${p.total}`
      : `${t("loading")} ${p.done}/${p.total} · ${p.percent}%`;
  $("#progress-eta").textContent =
    p.percent >= 100 ? "" : `${t("eta")} ~${Math.ceil((p.etaMs || 0) / 1000)}s`;

  $("#source-status").innerHTML = Object.values(p.sources || {})
    .map((s) => {
      const detail =
        s.state === "error"
          ? s.error
          : s.state === "ok" || s.state === "empty"
            ? `${s.count}`
            : t(s.state);
      return `<div class="source-pill" data-state="${s.state}"><strong>${s.name}</strong>${escapeHtml(String(detail))}</div>`;
    })
    .join("");
}

function renderHacksApplied(applied = [], expanded = []) {
  const box = $("#hacks-applied");
  if (!applied.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const labels = {
    "synonym-or": t("hackChipSynonym"),
    "exclude-junior": t("hackChipExcludeJunior"),
    "remote-boost": t("hackChipRemote"),
    "brazil-latam-boost": t("hackChipBrazil"),
    "default-remote": t("hackChipDefaultRemote"),
    "sort-hack-relevance": t("hackChipSort"),
    "multi-api-query": t("hackChipMultiApi"),
    "external-hack-links": t("hackChipExternal"),
  };
  box.hidden = false;
  box.innerHTML = `
    <div class="hacks-applied-label">${t("hacksApplied")}</div>
    <div class="badges">
      ${applied.map((a) => `<span class="badge latam">${escapeHtml(labels[a] || a)}</span>`).join("")}
      ${expanded.length ? `<span class="badge">${expanded.length} ${t("hackChipTerms")}</span>` : ""}
    </div>`;
}

function openTopHacks() {
  const { external } = applySearchHacks(readFilters());
  const list = external.slice(0, 5);
  for (const item of list) window.open(item.url, "_blank", "noopener,noreferrer");
  toast(`${list.length} ${t("hacksOpened")}`);
}

async function runSearch(overrideFilters) {
  if (searching) return;
  searching = true;
  if (overrideFilters) applyFilterObject({ ...defaultFilters(), ...overrideFilters });
  const filters = readFilters();
  visibleCount = PAGE_SIZE;
  $("#btn-search").disabled = true;
  $("#progress-wrap").hidden = false;

  try {
    const result = await searchJobs(filters, renderProgress, filters.sources);
    const sourcesOk = Object.values(result.sources || {}).filter((s) => s.state === "ok").length;
    lastMeta = {
      sourcesOk,
      elapsedMs: result.elapsedMs,
      hacks: result.hacksApplied || [],
    };
    renderJobs(
      result.jobs,
      result.effectiveFilters || filters,
      result.externalHacks || []
    );
    renderHacksApplied(result.hacksApplied || [], result.expandedKeywords || []);
    $("#results-panel").scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Multi-select chips: toggle without clearing other filters
  document.querySelectorAll(".chip-btn[data-multi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      // Keep at least one geo selected
      if (
        btn.dataset.multi === "geo" &&
        !document.querySelector('.chip-btn.active[data-multi="geo"]')
      ) {
        btn.classList.add("active");
      }
      syncMultiChip(btn.dataset.multi);
    });
  });

  $("#presets-grid").addEventListener("click", (e) => {
    const card = e.target.closest("[data-preset]");
    if (!card) return;
    const preset = SEARCH_PRESETS.find((p) => p.id === card.dataset.preset);
    if (!preset) return;
    // Preset fills fields but multi chips still combine (OR) within each dimension
    runSearch(preset.filters);
  });

  $("#btn-open-hacks").addEventListener("click", openTopHacks);

  $("#btn-load-more").addEventListener("click", () => {
    visibleCount = lastJobs.length;
    renderJobs(lastJobs, readFilters());
    $("#load-more-wrap").hidden = true;
  });

  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      document.querySelectorAll(".lang-switch button").forEach((b) => {
        b.classList.toggle("active", b.dataset.lang === getLang());
      });
      document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
      applyI18n();
      renderPresets();
      if (lastJobs.length) renderJobs(lastJobs, readFilters());
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
      e.target.textContent = saved.has(url) ? t("unsave") : t("save");
    }
  });
}

function boot() {
  initLang();
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  document.querySelectorAll(".lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === getLang());
  });
  fillDefaults();
  renderSourceToggles();
  applyI18n();
  renderPresets();
  wireEvents();
}

boot();
