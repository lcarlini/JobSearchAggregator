import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { defaultFilters, splitTerms, sortJobs } from "./filters.js";
import { searchJobs, ADAPTERS } from "./search-engine.js";
import { applySearchHacks } from "./apply-hacks.js";
import { SEARCH_PRESETS } from "./presets.js";
import {
  loadInterests,
  hasInterest,
  getInterest,
  addInterest,
  removeInterest,
  updateInterest,
  clearInterests,
  INTEREST_STATUSES,
} from "./interests.js";
import { computeMatchScore, matchTier, isFreshJob } from "./match-score.js";
import {
  writeFiltersToUrl,
  shareUrl,
  searchParamsToFilters,
} from "./url-filters.js";

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
let selectedJobUrl = null;

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
    remoteScope: str("remoteScope", "any"),
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
  for (const name of ["geo", "workplace", "remoteScope", "seniority", "jobType"]) {
    syncMultiChip(name);
  }
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
  setMultiChips("remoteScope", d.remoteScope || "any");
  setMultiChips("seniority", d.seniority || "any");
  setMultiChips("jobType", d.jobType || "any");
  syncSalaryChips(d.salaryMin);
  const toolbarSort = $("#toolbar-sort");
  if (toolbarSort && d.sortBy) toolbarSort.value = d.sortBy;
}

function syncSalaryChips(min) {
  const val = min == null || min === "" || Number(min) === 0 ? "" : String(min);
  document.querySelectorAll("#salary-quick [data-salary]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.salary === val);
  });
}

function renderActiveFilters(filters) {
  const box = $("#active-filters");
  if (!box) return;
  const chips = [];
  const push = (key, label, clearable = true) => {
    chips.push({ key, label, clearable });
  };
  if (filters.keywords) push("keywords", filters.keywords.slice(0, 40));
  for (const g of String(filters.geo || "").split(",").filter((x) => x && x !== "any")) {
    push("geo", g);
  }
  for (const w of String(filters.workplace || "").split(",").filter((x) => x && x !== "any")) {
    push("workplace", w);
  }
  for (const s of String(filters.remoteScope || "").split(",").filter((x) => x && x !== "any")) {
    push("remoteScope", s);
  }
  for (const s of String(filters.seniority || "").split(",").filter((x) => x && x !== "any")) {
    push("seniority", s);
  }
  if (filters.recency && filters.recency !== "any") push("recency", filters.recency);
  if (filters.salaryMin) push("salaryMin", `$${Number(filters.salaryMin) / 1000}k+`);
  if (filters.brazilOk) push("brazilOk", "Brazil OK");
  if (filters.noAgency) push("noAgency", t("noAgency"));
  if (filters.skillsMust) push("skillsMust", filters.skillsMust.slice(0, 28));

  if (!chips.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <span class="active-filters-label">${t("activeFilters")}</span>
    ${chips
      .map(
        (c) =>
          `<button type="button" class="active-chip" data-clear="${escapeAttr(c.key)}" data-value="${escapeAttr(c.label)}">${escapeHtml(c.label)} <span aria-hidden="true">×</span></button>`
      )
      .join("")}
    <button type="button" class="active-chip clear-all" data-clear="__all__">${t("clearFilters")}</button>
  `;
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
  // Always rebuild from current filters so LinkedIn/Indeed/Google match the form
  const { external: hacked } = applySearchHacks(readFilters());
  const pool = hacked.length ? hacked : external;
  const pick = (re) => pool.find((e) => re.test(`${e.id} ${e.name}`));
  const mega = [
    pick(/^linkedin$/i) || pick(/linkedin(?!.*under|.*br|.*ca|.*ae)/i),
    pick(/^indeed$/i) || pick(/indeed(?!.*br|.*ca|.*nz|.*ae)/i),
    pick(/googlejobs|^google$/i),
    pick(/glassdoor/i),
    pick(/linkedin-br/i),
    pick(/indeed-br/i),
  ].filter(Boolean);
  // Dedupe by id
  const seen = new Set();
  const heroes = mega.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  const extras = pool
    .filter((e) => !seen.has(e.id) && /apinfo|remotar|gupy|linkedin|indeed|google/i.test(`${e.id}${e.name}`))
    .slice(0, 6);

  if (!heroes.length && !extras.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="external-hero">
      <div class="external-hero-copy">
        <div class="external-boards-label">${t("externalBoardsTitle")}</div>
        <p class="external-boards-hint">${t("externalBoardsHint")}</p>
        <p class="external-boards-warn">${t("externalNoApiWarn")}</p>
      </div>
      <button type="button" class="btn btn-primary" id="btn-open-big3">${t("openBig3")}</button>
    </div>
    <div class="deeplink-grid deeplink-grid-hero">
      ${heroes
        .map(
          (e) => `
        <a class="deeplink featured mega" data-mega="1" href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer">
          <strong>${escapeHtml(e.name)}</strong>
          <span>${escapeHtml(e.query || e.description || t("externalOpen"))}</span>
          <em>${t("externalClickOpen")}</em>
        </a>`
        )
        .join("")}
    </div>
    ${
      extras.length
        ? `<div class="deeplink-grid">
      ${extras
        .map(
          (e) => `
        <a class="deeplink" href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer">
          <strong>${escapeHtml(e.name)}</strong>
          <span>${escapeHtml(e.query || e.description || t("externalOpen"))}</span>
        </a>`
        )
        .join("")}
    </div>`
        : ""
    }`;

  $("#btn-open-big3")?.addEventListener("click", () => {
    const urls = heroes.slice(0, 4).map((e) => e.url);
    for (const url of urls) window.open(url, "_blank", "noopener,noreferrer");
    toast(`${urls.length} ${t("hacksOpened")}`);
  });
}

function jobTableRowHtml(job, filters, absoluteIndex) {
  const interested = hasInterest(interests, job);
  const saved = getInterest(interests, job);
  const match = job.matchScore ?? computeMatchScore(job, filters).score;
  const tier = matchTier(match);
  const fresh = isFreshJob(job, 48);
  const locBits = [];
  if (job.location) locBits.push(job.location);
  if (job.workplace && job.workplace !== "unknown") locBits.push(job.workplace);
  if (job.geo?.latamFriendly || job.geo?.brazil) locBits.push("LATAM/BR");
  const scopeBadge =
    job.remoteScope === "worldwide"
      ? `<span class="badge scope-world">${t("remoteScopeWorldwide")}</span>`
      : job.remoteScope === "country"
        ? `<span class="badge scope-country">${t("remoteScopeCountry")}</span>`
        : job.remoteScope === "region"
          ? `<span class="badge scope-region">${t("remoteScopeRegion")}</span>`
          : "";
  const snippet = highlight(job.description || "", filters);
  const statusBadge =
    saved?.status && saved.status !== "saved"
      ? `<span class="badge status-${escapeAttr(saved.status)}">${escapeHtml(t(`status_${saved.status}`))}</span>`
      : interested
        ? `<span class="badge status-saved">${escapeHtml(t("status_saved"))}</span>`
        : "";

  return `
  <tr class="job-row${interested ? " in-interests" : ""}${selectedJobUrl === job.url ? " is-selected" : ""}" data-url="${escapeAttr(job.url)}" data-job-id="${escapeAttr(job.id || job.url)}" title="${escapeAttr(t("clickForDetails"))}">
    <td class="col-index">${absoluteIndex}</td>
    <td class="col-match"><span class="match-pill match-${tier}" title="${t("matchScore")}">${match}%</span></td>
    <td class="col-title">
      <span class="job-title-btn">${escapeHtml(job.title)}</span>
      ${fresh ? `<span class="badge badge-new">${t("badgeNew")}</span>` : ""}
      ${statusBadge}
      ${snippet ? `<div class="job-snippet">${snippet}</div>` : ""}
    </td>
    <td class="col-company">${escapeHtml(job.company || "—")}</td>
    <td class="col-location">${escapeHtml(locBits.join(" · ") || "—")}${scopeBadge ? ` ${scopeBadge}` : ""}</td>
    <td class="col-source"><span class="badge source">${escapeHtml(job.source || "—")}</span></td>
    <td class="col-date">${escapeHtml(formatDate(job.postedAt))}</td>
    <td class="col-salary">${escapeHtml(job.salary || "—")}</td>
    <td class="col-actions">
      <div class="job-actions">
        <a class="btn btn-small btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${t("open")}</a>
        <button type="button" class="btn btn-small btn-ghost btn-open-drawer">${t("details")}</button>
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
          <th scope="col">${t("colMatch")}</th>
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

function enrichJobs(jobs, filters) {
  return jobs.map((job) => {
    const m = computeMatchScore(job, filters);
    return { ...job, matchScore: m.score, matchHits: m.hits };
  });
}

function openDrawer(job, filters) {
  const modal = $("#job-modal");
  if (!modal || !job) return;
  selectedJobUrl = job.url;
  const match = computeMatchScore(job, filters);
  const saved = getInterest(interests, job);
  const interested = Boolean(saved);
  const facts = [];
  if (job.source) facts.push(`<span class="badge source">${escapeHtml(job.source)}</span>`);
  if (job.workplace && job.workplace !== "unknown") {
    facts.push(`<span class="badge">${escapeHtml(job.workplace)}</span>`);
  }
  if (job.remoteScope && job.remoteScope !== "unknown") {
    facts.push(`<span class="badge">${escapeHtml(job.remoteScope)}</span>`);
  }
  if (job.jobType && job.jobType !== "unknown") {
    facts.push(`<span class="badge">${escapeHtml(job.jobType)}</span>`);
  }
  if (job.geo?.brazil || job.geo?.latamFriendly) {
    facts.push(`<span class="badge">LATAM/BR</span>`);
  }

  $("#drawer-title").textContent = job.title || "—";
  $("#drawer-meta").innerHTML = `
    <div><strong>${escapeHtml(job.company || "—")}</strong></div>
    <div class="drawer-sub">${escapeHtml(job.location || "—")} · ${formatDate(job.postedAt)}</div>
    ${job.salary ? `<div class="drawer-salary">${escapeHtml(job.salary)}</div>` : ""}
    ${facts.length ? `<div class="drawer-facts">${facts.join("")}</div>` : ""}
  `;
  $("#drawer-match").innerHTML = `
    <div class="match-bar"><span class="match-pill match-${matchTier(match.score)}">${match.score}% ${t("matchScore")}</span></div>
    ${
      match.hits.length
        ? `<div class="match-hits">${t("matchHits")}: ${match.hits
            .slice(0, 8)
            .map((h) => `<span class="badge">${escapeHtml(h)}</span>`)
            .join(" ")}</div>`
        : ""
    }
  `;
  $("#drawer-actions").innerHTML = `
    ${interested ? `<p class="drawer-already">${t("alreadySaved")}</p>` : ""}
    <a class="btn btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${t("open")}</a>
    ${
      interested
        ? `<button type="button" class="btn btn-ghost btn-unsave-job" data-url="${escapeAttr(job.url)}">${t("removeInterest")}</button>`
        : `<button type="button" class="btn btn-primary btn-save-job" data-url="${escapeAttr(job.url)}">${t("saveJob")}</button>`
    }
    <button type="button" class="btn btn-ghost btn-copy" data-url="${escapeAttr(job.url)}">${t("copy")}</button>
    ${
      interested
        ? `<button type="button" class="btn btn-ghost btn-goto-saved">${t("viewInterests")}</button>`
        : ""
    }
  `;
  const statusBox = $("#drawer-status");
  if (saved) {
    statusBox.hidden = false;
    statusBox.innerHTML = `
      <label>${t("applicationStatus")}
        <select id="drawer-status-select">
          ${INTEREST_STATUSES.map(
            (s) =>
              `<option value="${s}" ${saved.status === s ? "selected" : ""}>${t(`status_${s}`)}</option>`
          ).join("")}
        </select>
      </label>
      <label>${t("notes")}
        <textarea id="drawer-notes" rows="3" placeholder="${t("notesPh")}">${escapeHtml(saved.notes || "")}</textarea>
      </label>
      <button type="button" class="btn btn-small btn-ghost" id="drawer-save-meta">${t("saveNotes")}</button>
    `;
  } else {
    statusBox.hidden = true;
    statusBox.innerHTML = "";
  }
  const desc = job.description || "";
  $("#drawer-body").innerHTML = `
    <h4>${t("jobDescription")}</h4>
    <p>${escapeHtml(desc.slice(0, 2800))}${desc.length > 2800 ? "…" : ""}</p>
  `;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  $("#drawer-close")?.focus();
  document.querySelectorAll(".job-row").forEach((r) => {
    r.classList.toggle("is-selected", r.dataset.url === job.url);
  });
}

function closeDrawer() {
  selectedJobUrl = null;
  const modal = $("#job-modal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
  document.querySelectorAll(".job-row.is-selected").forEach((r) => r.classList.remove("is-selected"));
}

function exportCsv(jobs) {
  const rows = [
    ["title", "company", "location", "source", "salary", "postedAt", "match", "url"],
    ...jobs.map((j) => [
      j.title,
      j.company,
      j.location,
      j.source,
      j.salary || "",
      j.postedAt ? new Date(j.postedAt).toISOString() : "",
      j.matchScore ?? "",
      j.url,
    ]),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `jobs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const enriched = enrichJobs(jobs, filters);
  let sorted = enriched;
  const sortBy = filters.sortBy || "recency";
  if (sortBy === "hack-relevance") {
    sorted = [...enriched].sort((a, b) => {
      const ds = (b.matchScore || 0) - (a.matchScore || 0);
      if (ds) return ds;
      return (b.hackScore || 0) - (a.hackScore || 0) || (b.postedAt || 0) - (a.postedAt || 0);
    });
  } else {
    sorted = sortJobs(enriched, sortBy);
  }

  const slice = pageSlice(sorted);
  updateStats(slice, sorted.length);
  updateResultsSummary(sorted.length, slice);
  updateInterestsBadge();
  renderActiveFilters(filters);
  const toolbar = $("#results-toolbar");
  if (toolbar) toolbar.hidden = !sorted.length;
  const toolbarSort = $("#toolbar-sort");
  if (toolbarSort && filters.sortBy) toolbarSort.value = filters.sortBy;

  if (showExternal) renderExternalBoards(lastExternal);
  else {
    const boards = $("#external-boards");
    if (boards) boards.hidden = true;
  }
  renderPagination(sorted.length);

  if (!sorted.length) {
    list.innerHTML = `<div class="empty">${t(emptyKey)}</div>`;
    closeDrawer();
    return;
  }

  const rows = slice.items
    .map((job, idx) => jobTableRowHtml(job, filters, slice.start + idx + 1))
    .join("");
  list.innerHTML = jobsTableHtml(rows);

  if (selectedJobUrl) {
    const still = sorted.find((j) => j.url === selectedJobUrl);
    if (still) openDrawer(still, filters);
  }
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
    const effective = result.effectiveFilters || filters;
    writeFiltersToUrl(effective);
    renderJobs(result.jobs, effective, result.externalHacks || []);
    renderHacksApplied(result.hacksApplied || [], result.expandedKeywords || []);
    // Surface LinkedIn/Indeed/Google first — they never appear as table rows
    const ext = $("#external-boards");
    if (ext && !ext.hidden) ext.scrollIntoView({ behavior: "smooth", block: "center" });
    else $("#results-panel").scrollIntoView({ behavior: "smooth", block: "start" });
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

  $("#btn-share-search")?.addEventListener("click", async () => {
    const url = shareUrl(readFilters());
    try {
      await navigator.clipboard.writeText(url);
      toast(t("shareCopied"));
    } catch {
      toast(url);
    }
  });

  $("#salary-quick")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-salary]");
    if (!btn) return;
    const val = btn.dataset.salary || "";
    setFormValue("salaryMin", val);
    syncSalaryChips(val);
  });

  $("#active-filters")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-clear]");
    if (!chip) return;
    const key = chip.dataset.clear;
    if (key === "__all__") {
      applyFilterObject(defaultFilters());
      renderActiveFilters(readFilters());
      return;
    }
    if (["geo", "workplace", "remoteScope", "seniority", "jobType"].includes(key)) {
      setMultiChips(key, "any");
    } else if (key === "brazilOk" || key === "noAgency" || key === "latamOnly") {
      setFormValue(key, false);
    } else if (key === "salaryMin") {
      setFormValue("salaryMin", "");
      syncSalaryChips("");
    } else {
      setFormValue(key, key === "recency" ? "any" : "");
    }
    renderActiveFilters(readFilters());
  });

  $("#toolbar-sort")?.addEventListener("change", (e) => {
    setFormValue("sortBy", e.target.value);
    currentPage = 1;
    renderActiveView();
  });

  $("#btn-export-csv")?.addEventListener("click", () => {
    const filters = readFilters();
    const jobs = enrichJobs(activeView === "interests" ? interests : lastJobs, filters);
    if (!jobs.length) return toast(t("noResults"));
    exportCsv(jobs);
    toast(t("exportOk"));
  });

  $("#btn-copy-links")?.addEventListener("click", async () => {
    const jobs = activeView === "interests" ? interests : lastJobs;
    const text = jobs.map((j) => j.url).filter(Boolean).join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(t("copyOk"));
    } catch {
      toast(text.slice(0, 120));
    }
  });

  $("#drawer-close")?.addEventListener("click", closeDrawer);
  $("#job-modal-backdrop")?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#job-modal")?.hidden) closeDrawer();
  });

  $("#job-modal")?.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-copy")) {
      const url = e.target.dataset.url || selectedJobUrl;
      try {
        await navigator.clipboard.writeText(url);
        toast(t("copyOk"));
      } catch {
        toast(url);
      }
    }
    if (e.target.classList.contains("btn-save-job")) {
      const url = e.target.dataset.url || selectedJobUrl;
      const job = findJobByUrl(url);
      if (!job) return;
      const { list, added, already } = addInterest(interests, job);
      interests = list;
      if (already) toast(t("alreadySaved"));
      else if (added) toast(t("interestAdded"));
      updateInterestsBadge();
      renderActiveView();
      const again = findJobByUrl(url);
      if (again) openDrawer(again, readFilters());
    }
    if (e.target.classList.contains("btn-unsave-job")) {
      const url = e.target.dataset.url || selectedJobUrl;
      interests = removeInterest(interests, url);
      toast(t("interestRemoved"));
      updateInterestsBadge();
      renderActiveView();
      const again = findJobByUrl(url);
      if (again) openDrawer(again, readFilters());
      else closeDrawer();
    }
    if (e.target.classList.contains("btn-goto-saved")) {
      closeDrawer();
      setActiveView("interests");
      $("#results-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (e.target.id === "drawer-save-meta" && selectedJobUrl) {
      const status = $("#drawer-status-select")?.value || "saved";
      const notes = $("#drawer-notes")?.value || "";
      interests = updateInterest(interests, selectedJobUrl, { status, notes });
      toast(t("notesSaved"));
      renderActiveView();
    }
  });

  $("#tab-results")?.addEventListener("click", () => setActiveView("results"));
  $("#tab-interests")?.addEventListener("click", () => setActiveView("interests"));

  $("#btn-clear-interests")?.addEventListener("click", () => {
    interests = clearInterests();
    toast(t("interestsCleared"));
    updateInterestsBadge();
    closeDrawer();
    renderActiveView();
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
    // Keep native link / explicit action buttons from being swallowed
    if (e.target.closest("a") || e.target.closest("button:not(.btn-open-drawer)")) return;
    const job = findJobByUrl(url);
    if (job) openDrawer(job, readFilters());
  });
}

function boot() {
  initLang();
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  document.querySelectorAll(".lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === getLang());
  });
  fillDefaults();
  const fromUrl = searchParamsToFilters();
  if (Object.keys(fromUrl).length) {
    applyFilterObject({ ...defaultFilters(), ...fromUrl });
  }
  renderSourceToggles();
  applyI18n();
  renderPresets();
  updateInterestsBadge();
  renderActiveFilters(readFilters());
  wireEvents();
  if (fromUrl.keywords || fromUrl.geo) {
    runSearch();
  }
}

boot();
