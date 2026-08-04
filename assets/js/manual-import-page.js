import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { defaultFilters, applyFilters, sortJobs } from "./filters.js";
import { computeMatchScore, matchTier, isFreshJob } from "./match-score.js";
import {
  loadInterests,
  saveInterests,
  addInterest,
  hasInterest,
  getInterest,
  updateInterest,
  INTEREST_STATUSES,
} from "./interests.js";
import { generateConsoleScript } from "./manual-import/script-generator.js";
import { parseManualExport, isManualExport } from "./manual-import/schema.js";

const STORAGE_KEY = "jsa-manual-import-jobs";
const PAGE_SIZE = 20;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let allJobs = [];
let importMeta = { source: "—", searchUrl: null };
let currentPage = 1;
let selectedJobUrl = null;
let interests = loadInterests();
let lastScript = "";
let lastSearchUrl = "";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function formatDate(ts) {
  if (ts == null) return "—";
  const n = typeof ts === "number" ? ts : Date.parse(ts);
  if (!Number.isFinite(n)) return String(ts).slice(0, 16);
  try {
    return new Date(n).toLocaleDateString(getLang() === "pt" ? "pt-BR" : "en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function syncMultiChips() {
  $$(".multi-chips").forEach((group) => {
    const key = group.querySelector("[data-multi]")?.dataset.multi;
    if (!key) return;
    const hidden = $(`#${key}`) || $(`[name="${key}"]`);
    if (!hidden) return;
    const values = [...group.querySelectorAll(".chip-btn.active")]
      .map((b) => b.dataset.value)
      .filter(Boolean);
    hidden.value = values.join(",") || (key === "workplace" ? "remote" : key === "geo" ? "latam" : "any");
  });
}

function wireMultiChips() {
  $$(".multi-chips .chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      // geo: allow multiple; if none, default latam
      const group = btn.closest(".multi-chips");
      if (btn.dataset.multi === "geo" && !group.querySelector(".chip-btn.active")) {
        group.querySelector('[data-value="latam"]')?.classList.add("active");
      }
      syncMultiChips();
    });
  });
}

function readFilters() {
  syncMultiChips();
  const base = defaultFilters();
  return {
    ...base,
    keywords: $("#keywords")?.value?.trim() || "",
    geo: $("#geo")?.value || "latam",
    market: ($("#geo")?.value || "latam").split(",")[0],
    recency: $("#recency")?.value || "any",
    workplace: $("#workplace")?.value || "remote",
    seniority: $("#seniority")?.value || "any",
    jobType: $("#jobType")?.value || "any",
    titleInclude: $("#titleInclude")?.value?.trim() || "",
    titleExclude: $("#titleExclude")?.value?.trim() || "",
    skillsMust: $("#skillsMust")?.value?.trim() || "",
    company: $("#company")?.value?.trim() || "",
    applyHacks: true,
  };
}

function selectedBoard() {
  return document.querySelector('input[name="board"]:checked')?.value || "linkedin";
}

function persistJobs() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        source: importMeta.source,
        searchUrl: importMeta.searchUrl,
        jobs: allJobs.map((j) => ({
          id: j.id,
          source: j.source,
          title: j.title,
          company: j.company,
          url: j.url,
          description: j.description,
          location: j.location,
          salary: j.salary,
          postedAt: j.postedAt,
          tags: j.tags,
        })),
      })
    );
  } catch {
    /* quota */
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const parsed = parseManualExport(data);
    if (parsed.jobs.length) {
      allJobs = parsed.jobs;
      importMeta = { source: data.source || parsed.source, searchUrl: data.searchUrl || null };
    }
  } catch {
    /* ignore */
  }
}

function generate() {
  const filters = readFilters();
  const maxJobs = Number($("#maxJobs")?.value) || 120;
  const board = selectedBoard();
  const { searchUrl, script } = generateConsoleScript(board, filters, { maxJobs });
  lastScript = script;
  lastSearchUrl = searchUrl;
  $("#script-out").value = script;
  $("#btn-copy-script").disabled = false;
  $("#btn-open-search").href = searchUrl;
  $("#script-meta").textContent = `${board} · ${maxJobs} max · ${filters.keywords || "—"}`;
  toast(t("manualGenerated"));
}

async function copyScript() {
  if (!lastScript) generate();
  try {
    await navigator.clipboard.writeText(lastScript);
    toast(t("manualCopied"));
  } catch {
    $("#script-out").select();
    document.execCommand("copy");
    toast(t("manualCopied"));
  }
}

function toast(msg) {
  let el = $("#jsa-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "jsa-toast";
    el.className = "jsa-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function ingestPayload(data) {
  if (!isManualExport(data)) throw new Error(t("manualBadJson"));
  const parsed = parseManualExport(data);
  if (!parsed.jobs.length) throw new Error(t("manualNoJobs"));
  allJobs = parsed.jobs;
  importMeta = {
    source: parsed.source,
    searchUrl: parsed.searchUrl,
  };
  currentPage = 1;
  persistJobs();
  render();
  $("#upload-status").hidden = false;
  $("#upload-status").textContent = `${t("manualImported")} ${parsed.jobs.length} · ${parsed.source}`;
  $("#results-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onFile(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  ingestPayload(data);
}

function enrich(jobs, filters) {
  return jobs.map((job) => {
    const m = computeMatchScore(job, filters);
    return { ...job, matchScore: m.score, matchHits: m.hits };
  });
}

function jobRow(job, filters, index) {
  const interested = hasInterest(interests, job);
  const match = job.matchScore ?? 0;
  const tier = matchTier(match);
  const fresh = isFreshJob(job, 48);
  return `
  <tr class="job-row${interested ? " in-interests" : ""}${selectedJobUrl === job.url ? " is-selected" : ""}" data-url="${escapeAttr(job.url)}">
    <td class="col-index">${index}</td>
    <td class="col-match"><span class="match-pill match-${tier}">${match}%</span></td>
    <td class="col-title">
      <span class="job-title-btn">${escapeHtml(job.title)}</span>
      ${fresh ? `<span class="badge badge-new">${t("badgeNew")}</span>` : ""}
    </td>
    <td class="col-company">${escapeHtml(job.company || "—")}</td>
    <td class="col-location">${escapeHtml(job.location || "—")}</td>
    <td class="col-source"><span class="badge source">${escapeHtml(job.source || "—")}</span></td>
    <td class="col-date">${escapeHtml(formatDate(job.postedAt))}</td>
    <td class="col-salary">${escapeHtml(job.salary || "—")}</td>
    <td class="col-actions">
      <div class="job-actions">
        <a class="btn btn-small btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener">${t("open")}</a>
        <button type="button" class="btn btn-small btn-ghost btn-open-drawer">${t("details")}</button>
      </div>
    </td>
  </tr>`;
}

function render() {
  const filters = readFilters();
  const list = $("#job-list");
  const filtered = sortJobs(
    enrich(applyFilters(allJobs, { ...filters, sources: "" }), filters),
    filters.sortBy || "hack-relevance"
  );

  $("#stat-total").textContent = String(filtered.length);
  $("#stat-source").textContent = importMeta.source || "—";
  $("#stats-bar").hidden = !allJobs.length;
  $("#btn-export-csv").disabled = !filtered.length;
  $("#btn-clear-import").disabled = !allJobs.length;

  const summary = $("#results-summary");
  if (allJobs.length) {
    summary.hidden = false;
    summary.textContent = `${allJobs.length} ${t("manualImportedRaw")} → ${filtered.length} ${t("manualAfterFilters")}`;
  } else {
    summary.hidden = true;
  }

  if (!allJobs.length) {
    list.innerHTML = `<div class="empty">${escapeHtml(t("manualEmpty"))}</div>`;
    $("#pagination-wrap").hidden = true;
    return;
  }
  if (!filtered.length) {
    list.innerHTML = `<div class="empty">${escapeHtml(t("emptyFiltered"))}</div>`;
    $("#pagination-wrap").hidden = true;
    return;
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  $("#stat-showing").textContent = String(slice.length);

  list.innerHTML = `
  <div class="table-scroll">
    <table class="jobs-table">
      <thead>
        <tr>
          <th>${t("colIndex")}</th><th>${t("colMatch")}</th><th>${t("colTitle")}</th>
          <th>${t("colCompany")}</th><th>${t("colLocation")}</th><th>${t("colSource")}</th>
          <th>${t("colDate")}</th><th>${t("colSalary")}</th><th>${t("colActions")}</th>
        </tr>
      </thead>
      <tbody>
        ${slice.map((j, i) => jobRow(j, filters, start + i + 1)).join("")}
      </tbody>
    </table>
  </div>`;

  list.querySelectorAll(".job-row").forEach((tr) => {
    const url = tr.dataset.url;
    const job = filtered.find((j) => j.url === url);
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      openDrawer(job, filters);
    });
    tr.querySelector(".btn-open-drawer")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openDrawer(job, filters);
    });
  });

  const pag = $("#pagination");
  const wrap = $("#pagination-wrap");
  wrap.hidden = pages <= 1;
  $("#pagination-meta").textContent = `${t("manualPage")} ${currentPage}/${pages}`;
  pag.innerHTML = "";
  for (let p = 1; p <= pages; p++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn btn-small ${p === currentPage ? "btn-primary" : "btn-ghost"}`;
    b.textContent = String(p);
    b.addEventListener("click", () => {
      currentPage = p;
      render();
    });
    pag.appendChild(b);
  }
}

function openDrawer(job, filters) {
  const modal = $("#job-modal");
  if (!modal || !job) return;
  selectedJobUrl = job.url;
  const match = computeMatchScore(job, filters);
  const saved = getInterest(interests, job);
  $("#drawer-title").textContent = job.title;
  $("#drawer-meta").innerHTML = `
    <span class="badge source">${escapeHtml(job.source)}</span>
    <span>${escapeHtml(job.company || "")}</span>
    <span>${escapeHtml(job.location || "")}</span>`;
  $("#drawer-match").hidden = false;
  $("#drawer-match").innerHTML = `<strong>${match.score}%</strong> ${t("matchScore")}`;
  $("#drawer-actions").innerHTML = `
    <a class="btn btn-primary" href="${escapeAttr(job.url)}" target="_blank" rel="noopener">${t("open")}</a>
    <button type="button" class="btn btn-ghost" id="drawer-save">${saved ? t("manualSavedOk") : t("manualSaveJob")}</button>`;
  const statusBox = $("#drawer-status");
  if (saved) {
    statusBox.hidden = false;
    statusBox.innerHTML = `
      <label>${t("manualStatusLabel")}
        <select id="drawer-status-select">
          ${INTEREST_STATUSES.map(
            (s) =>
              `<option value="${s}" ${saved.status === s ? "selected" : ""}>${t(`status_${s}`)}</option>`
          ).join("")}
        </select>
      </label>`;
  } else statusBox.hidden = true;
  $("#drawer-body").textContent = job.description || t("manualNoDesc");
  modal.hidden = false;
  document.body.classList.add("modal-open");

  $("#drawer-save")?.addEventListener("click", () => {
    interests = addInterest(interests, job);
    saveInterests(interests);
    toast(t("manualSavedOk"));
    openDrawer(job, filters);
    render();
  });
  $("#drawer-status-select")?.addEventListener("change", (e) => {
    interests = updateInterest(interests, job.url, { status: e.target.value });
    saveInterests(interests);
  });
}

function closeDrawer() {
  $("#job-modal").hidden = true;
  document.body.classList.remove("modal-open");
  selectedJobUrl = null;
  render();
}

function exportCsv() {
  const filters = readFilters();
  const filtered = sortJobs(
    enrich(applyFilters(allJobs, { ...filters, sources: "" }), filters),
    "hack-relevance"
  );
  const header = ["title", "company", "location", "source", "salary", "postedAt", "match", "url"];
  const lines = [header.join(",")];
  for (const j of filtered) {
    const row = [
      j.title,
      j.company,
      j.location,
      j.source,
      j.salary,
      j.postedAt,
      j.matchScore,
      j.url,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);
    lines.push(row.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `jsa-manual-${importMeta.source || "import"}.csv`;
  a.click();
}

function boot() {
  initLang();
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  $$(".lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === getLang());
    b.addEventListener("click", () => {
      setLang(b.dataset.lang);
      $$(".lang-switch button").forEach((x) => x.classList.toggle("active", x.dataset.lang === getLang()));
      document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
      applyI18n();
      render();
    });
  });
  applyI18n();
  wireMultiChips();
  syncMultiChips();

  $$("#manual-boards input").forEach((inp) => {
    inp.addEventListener("change", () => {
      $$(".manual-board").forEach((l) => l.classList.toggle("active", l.querySelector("input").checked));
    });
  });

  $("#btn-generate")?.addEventListener("click", generate);
  $("#btn-copy-script")?.addEventListener("click", copyScript);
  $("#btn-open-search")?.addEventListener("click", (e) => {
    if (!lastSearchUrl) {
      e.preventDefault();
      generate();
      window.open(lastSearchUrl, "_blank", "noopener");
    }
  });

  const zone = $("#upload-zone");
  const fileInput = $("#file-input");
  $("#btn-pick-file")?.addEventListener("click", () => fileInput.click());
  zone?.addEventListener("click", (e) => {
    if (e.target === zone || e.target.closest("p")) fileInput.click();
  });
  zone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-drag");
  });
  zone?.addEventListener("dragleave", () => zone.classList.remove("is-drag"));
  zone?.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-drag");
    const f = e.dataTransfer?.files?.[0];
    onFile(f).catch((err) => {
      $("#upload-status").hidden = false;
      $("#upload-status").textContent = err.message || String(err);
    });
  });
  fileInput?.addEventListener("change", () => {
    onFile(fileInput.files?.[0]).catch((err) => {
      $("#upload-status").hidden = false;
      $("#upload-status").textContent = err.message || String(err);
    });
  });

  $("#btn-export-csv")?.addEventListener("click", exportCsv);
  $("#btn-clear-import")?.addEventListener("click", () => {
    allJobs = [];
    importMeta = { source: "—", searchUrl: null };
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  $("#drawer-close")?.addEventListener("click", closeDrawer);
  $("#job-modal-backdrop")?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // re-filter on filter changes after import
  $("#manual-form")?.addEventListener("change", () => {
    if (allJobs.length) render();
  });
  $("#keywords")?.addEventListener("input", () => {
    if (allJobs.length) {
      clearTimeout(window._jsaMf);
      window._jsaMf = setTimeout(render, 250);
    }
  });

  loadPersisted();
  generate();
  render();
}

boot();
