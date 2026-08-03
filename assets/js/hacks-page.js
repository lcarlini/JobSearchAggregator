import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import {
  OPERATOR_DOCS,
  SITE_HACKS,
  EXTRA_TIPS,
  buildSearchRecipes,
} from "./search-hacks.js";
import { applySearchHacks } from "./apply-hacks.js";

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1600);
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

function currentFilters() {
  return {
    keywords: $("#hack-keywords").value || ".NET, C#, React",
    recency: $("#hack-recency").value || "24h",
    geo: "latam",
    market: "latam",
    workplace: "remote",
    seniority: "senior+",
    applyHacks: true,
    brazilOk: true,
  };
}

function render() {
  const filters = currentFilters();
  const sections = [
    ["hacksGoogle", OPERATOR_DOCS.google],
    ["hacksLinkedIn", OPERATOR_DOCS.linkedin],
    ["hacksIndeed", OPERATOR_DOCS.indeed],
  ];
  $("#hacks-ops").innerHTML = sections
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
    <a class="deeplink" href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer">
      <strong>${escapeHtml(s.name)}</strong>
      <span>${s.tips.map((tip) => t(tip)).join(" · ")}</span>
    </a>`
  ).join("");

  const recipes = buildSearchRecipes(filters);
  $("#recipes").innerHTML = recipes
    .map(
      (r) => `
    <article class="recipe-row" data-query="${escapeAttr(r.query)}">
      <div>
        <div class="recipe-platform">${escapeHtml(r.platform)}</div>
        <strong>${t(r.titleKey)}</strong>
        <pre class="recipe-query">${escapeHtml(r.query)}</pre>
      </div>
      <div class="job-actions">
        <a class="btn btn-small btn-primary" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${t("openRecipe")}</a>
        <button type="button" class="btn btn-small btn-ghost btn-copy-query">${t("copyQuery")}</button>
      </div>
    </article>`
    )
    .join("");

  $("#extra-tips").innerHTML = EXTRA_TIPS.map((tip) => `<li>${t(tip)}</li>`).join("");
}

function boot() {
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
      render();
    });
  });
  applyI18n();
  render();

  $("#btn-refresh-recipes").addEventListener("click", render);
  $("#hack-keywords").addEventListener("change", render);
  $("#hack-recency").addEventListener("change", render);

  $("#btn-open-top").addEventListener("click", () => {
    const { external } = applySearchHacks(currentFilters());
    external.slice(0, 5).forEach((e) => window.open(e.url, "_blank", "noopener,noreferrer"));
    toast(`${Math.min(5, external.length)} ${t("hacksOpened")}`);
  });

  $("#recipes").addEventListener("click", async (e) => {
    if (!e.target.classList.contains("btn-copy-query")) return;
    const row = e.target.closest(".recipe-row");
    try {
      await navigator.clipboard.writeText(row.dataset.query);
      toast(t("copyOk"));
    } catch {
      toast(row.dataset.query);
    }
  });
}

boot();
