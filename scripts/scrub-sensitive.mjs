#!/usr/bin/env node
/**
 * Remove personal / employer-internal URLs from published catalogs.
 * Does not delete the whole catalog — only sensitive entries.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SENSITIVE_RE = [
  /grupoltm/i,
  /authkey=/i,
  /LeandroCarliniMingorance/i,
  /Mingorance/i,
  /sharepoint\.com\/personal\//i,
  /\.azurewebsites\.net/i,
  /intranet\./i,
  /webmail\./i,
  /sonarqube\./i,
  /service-now\.com/i,
  /login\.microsoftonline\.com/i,
  /prdlogsrv\./i,
  /logs\.intranet/i,
  /reembolso\./i,
  /ltmh-/i,
  /ltmcontacorrente/i,
  /clickaonline\.com/i,
  /hml-marketplace/i,
  /visualstudio\.com\/Premiacao/i,
  /atlassian\.net\/wiki/i,
  /cloudapp\.net/i,
  /deal\.com\.br\/SitePages/i,
  /onedrive\.live\.com/i,
  /outlook\.com\/.*safelinks/i,
  /eur02\.safelinks/i,
];

function isSensitive(entry) {
  const blob = [entry.url, entry.searchUrl, entry.linkFinalUrl, entry.host, entry.name]
    .filter(Boolean)
    .join(" ");
  return SENSITIVE_RE.some((re) => re.test(blob));
}

function scrubFile(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  let removed = 0;
  for (const key of ["companies", "featured", "boards", "bookmarkBoards", "links"]) {
    if (!Array.isArray(data[key])) continue;
    const before = data[key].length;
    data[key] = data[key].filter((e) => {
      if (isSensitive(e)) {
        removed++;
        return false;
      }
      return true;
    });
    if (key === "companies" && data.stats) {
      data.stats.total = data[key].length;
    }
    console.log(`  ${rel} ${key}: ${before} → ${data[key].length}`);
  }
  if (data.linkHealth && data.companies) {
    data.linkHealth.total = (data.companies?.length || 0) + (data.featured?.length || 0);
    data.linkHealth.ok = [...(data.featured || []), ...(data.companies || [])].filter(
      (c) => c.linkOk
    ).length;
    data.linkHealth.fail = [...(data.featured || []), ...(data.companies || [])].filter(
      (c) => c.linkOk === false
    ).length;
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log(`  removed ${removed} sensitive entries from ${rel}`);
}

console.log("Scrubbing sensitive personal/employer URLs…");
scrubFile("data/empresas.json");
scrubFile("data/sources.json");
scrubFile("data/career-link-status.json");
// local-only (gitignored) but keep clean
scrubFile("data/link-health.json");
console.log("Done.");
