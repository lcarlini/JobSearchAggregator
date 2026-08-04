import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";

const $ = (s) => document.querySelector(s);

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

function pickCount(counts, key, fallback = 0) {
  if (!key || key === "live") return fallback;
  if (key.startsWith("byAts.")) {
    const k = key.slice(6);
    return Number(counts.byAts?.[k] ?? 0);
  }
  return Number(counts[key] ?? 0);
}

function rankSize(weight, maxW) {
  const t = weight / maxW;
  // ~0.85rem → ~2.55rem — importance as visual size
  const px = 0.85 + t * 1.7;
  return `${px.toFixed(2)}rem`;
}

function chipHtml(item, maxW, lang) {
  const count = item.count ?? 0;
  const countLabel =
    item.mode === "auto"
      ? count > 0
        ? `${count.toLocaleString(lang === "pt" ? "pt-BR" : "en")} ${t("fontesJobs")}`
        : item.liveEstimate
          ? `~${item.liveEstimate} ${t("fontesLive")}`
          : t("fontesNoCache")
      : t("fontesOpenSite");
  const why = item.mode === "manual" ? item.why || item.note : item.how || item.note;
  const size = rankSize(item.weight, maxW);
  return `
  <a class="fontes-chip ${item.mode}" role="listitem" href="${escapeAttr(item.url)}"
     target="_blank" rel="noopener noreferrer"
     style="--chip-size:${size}"
     title="${escapeAttr(why)}">
    <span class="fontes-chip-name">${escapeHtml(item.name)}</span>
    <span class="fontes-chip-meta">${escapeHtml(countLabel)}</span>
    <span class="fontes-chip-note">${escapeHtml(item.note || why || "")}</span>
  </a>`;
}

function renderCloud(el, items, lang) {
  if (!el) return;
  const maxW = Math.max(...items.map((i) => i.weight), 1);
  const sorted = [...items].sort((a, b) => b.weight - a.weight || (b.count || 0) - (a.count || 0));
  el.innerHTML = sorted.map((i) => chipHtml(i, maxW, lang)).join("");
}

async function loadCounts() {
  const counts = { byAts: {}, himalayas: 0, apinfo: 0, themuse: 0, remotejobsorg: 0, wwr: 0 };
  try {
    const ats = await (await fetch("./data/ats-jobs.json")).json();
    counts.byAts = ats.byAts || {};
    counts.staticAts = ats.count || (ats.jobs || []).length;
  } catch {
    /* keep zeros */
  }
  const files = [
    ["apinfo", "./data/apinfo-jobs.json", (d) => d.count ?? d.jobs?.length ?? 0],
    ["himalayas", "./data/himalayas-jobs.json", (d) => d.count ?? d.jobs?.length ?? 0],
    ["themuse", "./data/themuse-jobs.json", (d) => d.count ?? d.jobs?.length ?? 0],
    ["remotejobsorg", "./data/remotejobsorg-jobs.json", (d) => d.count ?? d.data?.length ?? 0],
    ["wwr", "./data/weworkremotely-jobs.json", (d) => d.count ?? d.jobs?.length ?? 0],
  ];
  await Promise.all(
    files.map(async ([key, url, pick]) => {
      try {
        const d = await (await fetch(url)).json();
        counts[key] = pick(d);
      } catch {
        counts[key] = 0;
      }
    })
  );
  return counts;
}

async function boot() {
  initLang();
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  document.querySelectorAll(".lang-switch button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === getLang());
    b.addEventListener("click", () => {
      setLang(b.dataset.lang);
      document.querySelectorAll(".lang-switch button").forEach((x) => {
        x.classList.toggle("active", x.dataset.lang === getLang());
      });
      document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
      applyI18n();
      // re-render chip labels
      bootRender();
    });
  });

  applyI18n();
  await bootRender();
}

let catalogCache = null;
let countsCache = null;

async function bootRender() {
  if (!catalogCache) {
    catalogCache = await (await fetch("./data/fontes-catalog.json")).json();
  }
  if (!countsCache) countsCache = await loadCounts();
  const lang = getLang();

  const auto = catalogCache.auto.map((s) => ({
    ...s,
    count: pickCount(countsCache, s.countKey, s.liveEstimate || 0),
  }));
  // Re-rank weight slightly by actual count for auto sources
  const maxCount = Math.max(...auto.map((a) => a.count || 0), 1);
  for (const a of auto) {
    const volumeBoost = ((a.count || 0) / maxCount) * 25;
    a.displayWeight = a.weight * 0.7 + volumeBoost;
  }
  auto.sort((a, b) => b.displayWeight - a.displayWeight);
  // normalize weight field used for size
  for (const a of auto) a.weight = a.displayWeight;

  const manual = [...catalogCache.manual].sort((a, b) => b.weight - a.weight);

  renderCloud($("#fontes-auto"), auto, lang);
  renderCloud($("#fontes-manual"), manual, lang);

  const jobsTotal =
    (countsCache.staticAts || 0) +
    (countsCache.apinfo || 0) +
    (countsCache.himalayas || 0) +
    (countsCache.themuse || 0) +
    (countsCache.remotejobsorg || 0) +
    (countsCache.wwr || 0);

  $("#stat-auto-count").textContent = String(auto.length);
  $("#stat-manual-count").textContent = String(manual.length);
  $("#stat-jobs-count").textContent = jobsTotal.toLocaleString(lang === "pt" ? "pt-BR" : "en");
  $("#fontes-stats").hidden = false;
}

boot();
