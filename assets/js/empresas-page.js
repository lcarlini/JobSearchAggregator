import { initLang, setLang, getLang, t, applyI18n } from "./i18n.js";
import { loadEmpresas, filterCompanies, groupCompanies } from "./companies.js";

const $ = (sel) => document.querySelector(sel);
let allCompanies = [];

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

function groupLabel(key) {
  const map = {
    featured: "regionFeatured",
    brazil: "groupBrazil",
    worldwide: "groupWorldwide",
    "us-br": "groupUsBr",
    "eu-br": "groupEuBr",
    "au-br": "groupAuBr",
    latam: "regionLatam",
    bookmark: "regionBookmark",
  };
  return t(map[key] || key);
}

function render() {
  let filtered = filterCompanies(allCompanies, {
    q: $("#company-q").value || "",
    region: $("#company-region").value || "any",
    type: $("#company-type").value || "any",
  });
  const linkFilter = $("#company-link")?.value || "any";
  if (linkFilter === "ok") filtered = filtered.filter((c) => c.linkOk === true);
  else if (linkFilter === "fail") filtered = filtered.filter((c) => c.linkOk === false);

  const okCount = allCompanies.filter((c) => c.linkOk === true).length;
  $("#stat-total").textContent = String(filtered.length);
  const statOk = $("#stat-link-ok");
  if (statOk) statOk.textContent = String(okCount);

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
            const note = c.note || `${c.type || ""} · ${c.host || ""}`;
            const okClass = c.linkOk === true ? " link-ok" : c.linkOk === false ? " link-fail" : "";
            const badge =
              c.linkOk === true
                ? `<em class="link-badge ok" title="${escapeAttr(t("linkOkTitle"))}">${escapeHtml(t("linkOkBadge"))}</em>`
                : c.linkOk === false
                  ? `<em class="link-badge fail" title="${escapeAttr(t("linkFailTitle"))}">${escapeHtml(t("linkFailBadge"))}</em>`
                  : "";
            return `
          <a class="deeplink${c.featured ? " featured" : ""}${okClass}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(c.name)}${c.featured ? " ★" : ""}${badge}</strong>
            <span>${escapeHtml(note)}</span>
          </a>`;
          })
          .join("")}
      </div>
    </div>`
    )
    .join("");
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
      render();
    });
  });
  applyI18n();

  ["company-q", "company-region", "company-type", "company-link"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  try {
    const data = await loadEmpresas();
    allCompanies = data.companies || [];
    render();
  } catch (err) {
    $("#companies-groups").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

boot();
