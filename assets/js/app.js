import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { defaultFilters, splitTerms } from "./filters.js";
import { searchJobs, ADAPTERS } from "./search-engine.js";
import { applySearchHacks } from "./apply-hacks.js";
import { SEARCH_PRESETS } from "./presets.js";
import {
  loadInterests,
  hasInterest,
  toggleInterest,
  clearInterests,
} from "./interests.js";

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

let interests = loadInterests();
let lastJobs = [];
let lastExternal = [];
let lastMeta = { sourcesOk: 0, elapsedMs: 0, hacks: [] };
let currentPage = 1;
let pageSize = 20;
let activeView = "results"; // results | interests
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

function totalPages(total) {
  return Math.max(1, Math.ceil(total / pageSize));
}

function pageSlice(jobs) {
  const pages = totalPages(jobs.length);
  if (currentPage > pages) currentPage = pages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * pageSize;
  return {
    start,
    end: Math.min(start + pageSize, jobs.length),
    page: currentPage,
    pages,
    items: jobs.slice(start, start + pageSize),
  };
}

function updateInterestsBadge() {
  const badge = $("#interests-badge");
  if (badge) badge.textContent = String(interests.length);
  const clearBtn = $("#btn-clear-interests");
  if (clearBtn) clearBtn.hidden = activeView !== "interests" || !interests.length;
}

function updateStats(slice, total) {
  const bar = $("#stats-bar");
  if (activeView === "interests") {
    bar.hidden = false;
    $("#stat-total").textContent = String(total);
    $("#stat-sources").textContent = "—";
    $("#stat-time").textContent = "—";
    $("#stat-showing").textContent = String(slice.items.length);
    return;
  }
  bar.hidden = false;
  $("#stat-total").textContent = String(total);
  $("#stat-sources").textContent = String(lastMeta.sourcesOk || 0);
  $("#stat-time").textContent =
    lastMeta.elapsedMs != null ? `${(lastMeta.elapsedMs / 1000).toFixed(1)}s` : "—";
  $("#stat-showing").textContent = String(slice.items.length);
}

function updateResultsSummary(total, slice) {
  const summary = $("#results-summary");
  const title = $("#results-title");
  if (!summary) return;
  if (activeView === "interests") {
    if (title) title.textContent = t("viewInterests");
    summary.hidden = false;
    summary.textContent = total
      ? `${total} · ${t("pageOf")} ${slice.page} ${t("pageOfSep")} ${slice.pages} · ${t("showingRange")} ${slice.start + 1}–${slice.end}`
      : t("interestsEmpty");
    return;
  }
  if (title) title.textContent = t("results");
  if (!total && !lastMeta.elapsedMs) {
    summary.hidden = true;
    summary.textContent = "";
    return;
  }
  summary.hidden = false;
  summary.textContent = total
    ? `${total} ${t("resultsCount")} · ${t("pageOf")} ${slice.page} ${t("pageOfSep")} ${slice.pages} · ${t("showingRange")} ${slice.start + 1}–${slice.end}`
    : t("noResults");
}

function renderPagination(total) {
  const wrap = $("#pagination-wrap");
  const nav = $("#pagination");
  const meta = $("#pagination-meta");
  if (!wrap || !nav) return;

  if (!total) {
    wrap.hidden = true;
    nav.innerHTML = "";
    if (meta) meta.textContent = "";
    return;
  }

  wrap.hidden = false;
  const pages = totalPages(total);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  if (meta) {
    meta.textContent = `${t("showingRange")} ${start}–${end} ${t("pageOfSep")} ${total} · ${t("pageOf")} ${currentPage} ${t("pageOfSep")} ${pages}`;
  }

  const windowSize = 5;
  let from = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let to = Math.min(pages, from + windowSize - 1);
  from = Math.max(1, to - windowSize + 1);

  const parts = [];
  parts.push(
    `<button type="button" class="page-btn" data-page="prev" ${currentPage <= 1 ? "disabled" : ""}>${t("prevPage")}</button>`
  );
  if (from > 1) {
    parts.push(`<button type="button" class="page-btn" data-page="1">1</button>`);
    if (from > 2) parts.push(`<span class="page-ellipsis">…</span>`);
  }
  for (let p = from; p <= to; p++) {
    parts.push(
      `<button type="button" class="page-btn${p === currentPage ? " active" : ""}" data-page="${p}">${p}</button>`
    );
  }
  if (to < pages) {
    if (to < pages - 1) parts.push(`<span class="page-ellipsis">…</span>`);
    parts.push(
      `<button type="button" class="page-btn" data-page="${pages}">${pages}</button>`
    );
  }
  parts.push(
    `<button type="button" class="page-btn" data-page="next" ${currentPage >= pages ? "disabled" : ""}>${t("nextPage")}</button>`
  );
  nav.innerHTML = parts.join("");
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

function jobTableRowHtml(job, filters, absoluteIndex) {
  const interested = hasInterest(interests, job);
  const locBits = [];
  if (job.location) locBits.push(job.location);
  if (job.workplace && job.workplace !== "unknown") locBits.push(job.workplace);
  if (job.geo?.latamFriendly || job.geo?.brazil) locBits.push("LATAM/BR");
  const snippet = highlight(job.description || "", filters);

  return `
  <tr class="job-row${interested ? " in-interests" : ""}" data-url="${escapeAttr(job.url)}" data-job-id="${escapeAttr(job.id || job.url)}">
    <td class="col-index">${absoluteIndex}</td>
    <td class="col-title">
      <a class="job-title-link" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a>
      ${snippet ? `<div class="job-snippet">${snippet}</div>` : ""}
    </td>
    <td class="col-company">${escapeHtml(job.company || "—")}</td>
    <td class="col-location">${escapeHtml(locBits.join(" · ") || "—")}</td>
    <td class="col-source"><span class="badge source">${escapeHtml(job.source || "—")}</span></td>
    <td class="col-date">${escapeHtml(formatDate(job.postedAt))}</td>
    <td class="col-salary">${escapeHtml(job.salary || "—")}</td>
    <td class="col-actions">
      <div class="job-actions">
        <a class="btn btn-small btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${t("open")}</a>
        <button type="button" class="btn btn-small btn-ghost btn-copy">${t("copy")}</button>
        <button type="button" class="btn btn-small ${interested ? "btn-interest active" : "btn-ghost"} btn-interest-toggle">${interested ? t("inInterests") : t("addInterest")}</button>
      </div>
    </td>
  </tr>`;
}

function jobsTableHtml(rowsHtml) {
  return `
  <div class="table-scroll">
    <table class="jobs-table">
      <thead>
        <tr>
          <th scope="col">${t("colIndex")}</th>
          <th scope="col">${t("colTitle")}</th>
          <th scope="col">${t("colCompany")}</th>
          <th scope="col">${t("colLocation")}</th>
          <th scope="col">${t("colSource")}</th>
          <th scope="col">${t("colDate")}</th>
          <th scope="col">${t("colSalary")}</th>
          <th scope="col">${t("colActions")}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>`;
}

function setActiveView(view) {
  activeView = view === "interests" ? "interests" : "results";
  currentPage = 1;
  $("#tab-results")?.classList.toggle("active", activeView === "results");
  $("#tab-interests")?.classList.toggle("active", activeView === "interests");
  const boards = $("#external-boards");
  const hacks = $("#hacks-applied");
  if (activeView === "interests") {
    if (boards) boards.hidden = true;
    if (hacks) hacks.hidden = true;
  } else if (hacks?.innerHTML.trim()) {
    hacks.hidden = false;
  }
  renderActiveView();
}

function renderActiveView() {
  const filters = readFilters();
  updateInterestsBadge();
  if (activeView === "interests") {
    renderJobList(interests, filters, { emptyKey: "interestsEmpty", showExternal: false });
    return;
  }
  renderJobList(lastJobs, filters, {
    emptyKey: lastJobs.length || lastMeta.elapsedMs ? "noResults" : "emptyStart",
    showExternal: true,
  });
}

function renderJobs(jobs, filters, external = lastExternal) {
  lastJobs = jobs;
  if (external?.length) lastExternal = external;
  if (activeView !== "results") setActiveView("results");
  else renderJobList(jobs, filters || readFilters(), { emptyKey: "noResults", showExternal: true });
}

function renderJobList(jobs, filters, { emptyKey, showExternal }) {
  const list = $("#job-list");
  const slice = pageSlice(jobs);
  updateStats(slice, jobs.length);
  updateResultsSummary(jobs.length, slice);
  updateInterestsBadge();
  if (showExternal) renderExternalBoards(lastExternal);
  else {
    const boards = $("#external-boards");
    if (boards) boards.hidden = true;
  }
  renderPagination(jobs.length);

  if (!jobs.length) {
    list.innerHTML = `<div class="empty">${t(emptyKey)}</div>`;
    return;
  }

  const rows = slice.items
    .map((job, idx) => jobTableRowHtml(job, filters, slice.start + idx + 1))
    .join("");
  list.innerHTML = jobsTableHtml(rows);
}

function findJobByUrl(url) {
  return (
    lastJobs.find((j) => j.url === url) ||
    interests.find((j) => j.url === url) ||
    null
  );
}

function setSearchingUi(on) {
  const btn = $("#btn-search");
  const list = $("#job-list");
  const wrap = $("#progress-wrap");
  if (btn) {
    btn.disabled = !!on;
    btn.classList.toggle("is-searching", !!on);
  }
  if (list) {
    list.classList.toggle("is-loading", !!on);
    list.dataset.loadingLabel = t("searchingOverlay");
  }
  if (wrap && on) {
    wrap.hidden = false;
    wrap.dataset.state = "running";
    wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function renderProgress(p) {
  const wrap = $("#progress-wrap");
  if (!wrap) return;
  wrap.hidden = false;
  const done = p.percent >= 100;
  wrap.dataset.state = done ? "done" : "running";

  const pct = Math.max(0, Math.min(100, Number(p.percent) || 0));
  const fill = $("#progress-fill");
  if (fill) fill.style.width = `${pct}%`;
  const bar = $("#progress-bar");
  if (bar) bar.setAttribute("aria-valuenow", String(pct));

  const sources = Object.values(p.sources || {});
  const running = sources.filter((s) => s.state === "running" || s.state === "pending").length;
  const ready = sources.filter((s) => ["ok", "empty", "error"].includes(s.state)).length;
  const jobsSoFar = sources.reduce((n, s) => n + (Number(s.count) || 0), 0);
  const runningNames = sources
    .filter((s) => s.state === "running")
    .map((s) => s.name)
    .slice(0, 3);

  $("#progress-percent").textContent = `${pct}%`;
  $("#progress-label").textContent = done
    ? `${t("done")} · ${p.done}/${p.total}`
    : `${t("loading")} · ${p.done}/${p.total}`;
  $("#progress-detail").textContent = done
    ? t("doneDetail")
    : runningNames.length
      ? `${t("loadingDetail")} — ${runningNames.join(", ")}${running > runningNames.length ? "…" : ""}`
      : t("loadingDetail");
  $("#progress-eta").textContent = done
    ? ""
    : p.etaMs > 0
      ? `${t("eta")} ~${Math.max(1, Math.ceil(p.etaMs / 1000))}s`
      : t("sourcesRunning");

  const counters = $("#progress-counters");
  if (counters) {
    counters.innerHTML = `
      <span class="progress-chip"><strong>${ready}</strong> / ${p.total} ${t("sourcesDone")}</span>
      <span class="progress-chip"><strong>${running}</strong> ${t("sourcesRunning")}</span>
      <span class="progress-chip"><strong>${jobsSoFar}</strong> ${t("jobsSoFar")}</span>
    `;
  }

  $("#source-status").innerHTML = sources
    .map((s) => {
      const detail =
        s.state === "error"
          ? s.error || t("error")
          : s.state === "ok"
            ? `${s.count} ${t("jobsFound")}`
            : s.state === "empty"
              ? `0 · ${t("empty")}`
              : t(s.state);
      return `<div class="source-pill" data-state="${s.state}">
        <strong>${escapeHtml(s.name)}</strong>
        <span class="source-state"><span class="source-dot" aria-hidden="true"></span>${escapeHtml(String(detail))}</span>
      </div>`;
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
  currentPage = 1;
  activeView = "results";
  $("#tab-results")?.classList.add("active");
  $("#tab-interests")?.classList.remove("active");
  setSearchingUi(true);
  renderProgress({
    percent: 2,
    done: 0,
    total: ADAPTERS.filter((a) => !filters.sources || filters.sources.includes(a.id)).length || ADAPTERS.length,
    etaMs: 0,
    sources: Object.fromEntries(
      ADAPTERS.filter((a) => !filters.sources || filters.sources.includes(a.id)).map((a) => [
        a.id,
        { id: a.id, name: a.name, state: "pending", count: 0, error: null, ms: 0 },
      ])
    ),
  });

  try {
    const result = await searchJobs(filters, renderProgress, filters.sources);
    const sourcesOk = Object.values(result.sources || {}).filter((s) => s.state === "ok").length;
    lastMeta = {
      sourcesOk,
      elapsedMs: result.elapsedMs,
      hacks: result.hacksApplied || [],
    };
    renderProgress({
      percent: 100,
      done: Object.keys(result.sources || {}).length,
      total: Object.keys(result.sources || {}).length,
      etaMs: 0,
      sources: result.sources,
    });
    renderJobs(
      result.jobs,
      result.effectiveFilters || filters,
      result.externalHacks || []
    );
    renderHacksApplied(result.hacksApplied || [], result.expandedKeywords || []);
    $("#results-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    searching = false;
    setSearchingUi(false);
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

  $("#tab-results")?.addEventListener("click", () => setActiveView("results"));
  $("#tab-interests")?.addEventListener("click", () => setActiveView("interests"));

  $("#btn-clear-interests")?.addEventListener("click", () => {
    interests = clearInterests();
    toast(t("interestsCleared"));
    updateInterestsBadge();
    if (activeView === "interests") renderActiveView();
    else renderActiveView();
  });

  $("#page-size")?.addEventListener("change", (e) => {
    pageSize = Number(e.target.value) || 20;
    currentPage = 1;
    renderActiveView();
  });

  $("#pagination")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    const total = activeView === "interests" ? interests.length : lastJobs.length;
    const pages = totalPages(total);
    const raw = btn.dataset.page;
    if (raw === "prev") currentPage = Math.max(1, currentPage - 1);
    else if (raw === "next") currentPage = Math.min(pages, currentPage + 1);
    else currentPage = Number(raw) || 1;
    renderActiveView();
    $("#results-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      updateInterestsBadge();
      renderActiveView();
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
    if (e.target.classList.contains("btn-interest-toggle")) {
      const job = findJobByUrl(url);
      if (!job) return;
      const { list, added } = toggleInterest(interests, job);
      interests = list;
      toast(added ? t("interestAdded") : t("interestRemoved"));
      updateInterestsBadge();
      renderActiveView();
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
  updateInterestsBadge();
  wireEvents();
}

boot();
