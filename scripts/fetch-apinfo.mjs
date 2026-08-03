#!/usr/bin/env node
/**
 * Scrape ApInfo job listings into data/apinfo-jobs.json
 * POST list4.cfm?keyw=… (paginated). Used by GitHub Action + local refresh.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeText, stripHtml } from "../assets/js/normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "data", "apinfo-jobs.json");

const UA =
  "Mozilla/5.0 (compatible; JobSearchAggregator/1.0; +https://github.com/lcarlini/JobSearchAggregator)";

/** ApInfo serves ISO-8859-1; fetch().text() would corrupt accents as UTF-8. */
async function readHtml(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const latin1 = buf.toString("latin1");
  // Prefer declared charset when present
  const meta = latin1.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (meta === "utf-8" || meta === "utf8") return buf.toString("utf8");
  return latin1;
}

function parseBrDate(s) {
  // "04/08/26" or "04/08/2026"
  const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return new Date().toISOString();
  let [, dd, mm, yy] = m;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), 12));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseBoxes(html) {
  const jobs = [];
  const chunks = html.split(/class="box-vagas[^"]*"/i).slice(1);
  for (const chunk of chunks) {
    const codeM = chunk.match(/codvaga=(\d+)/i);
    if (!codeM) continue;
    const code = codeM[1];

    // Title may contain nested highlight <span>s — take whole cargo block
    const cargoM = chunk.match(/class="cargo[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const title = stripHtml(cargoM?.[1] || "");
    if (!title || title.length < 3) continue;

    const companyM =
      chunk.match(/Empresa[\s\S]{0,40}:\s*<\/strong>\s*([^<]+)/i) ||
      chunk.match(/Empresa[\s\S]{0,40}:\s*([^<]+)/i);
    const company = stripHtml(companyM?.[1] || "ApInfo");

    const dataM = chunk.match(/class="info-data"[^>]*>([\s\S]*?)<\/div>/i);
    const dataLine = stripHtml(dataM?.[1] || "");
    const location = dataLine.replace(/\s*-\s*\d{2}\/\d{2}\/\d{2,4}\s*$/, "").trim() || "Brasil";

    const textoM = chunk.match(/class="texto"[^>]*>([\s\S]*?)<\/div>/i);
    const description = stripHtml(textoM?.[1] || "").slice(0, 600);

    const pkeyM = chunk.match(/enviecv\.cfm\?codvaga=\d+&(?:amp;)?pkey=([^"'\s&]+)/i);
    const detailM = chunk.match(/list44\.cfm\?codvaga=\d+[^"']*/i);
    const url = detailM
      ? `https://www.apinfo.com/apinfo/inc/${detailM[0].replace(/&amp;/g, "&")}`
      : pkeyM
        ? `https://www.apinfo.com/apinfo/inc/enviecv.cfm?codvaga=${code}&pkey=${pkeyM[1]}`
        : `https://www.apinfo.com/apinfo/inc/list4.cfm`;

    const remote =
      /home office|\bho\b|remoto|remote/i.test(`${location} ${title} ${description}`);

    jobs.push({
      id: `apinfo:${code}`,
      title,
      company,
      url,
      description: description || `${title}. Fonte ApInfo.`,
      location,
      tags: ["apinfo", "brazil", "ti", ...(remote ? ["remote", "home-office"] : [])],
      postedAt: parseBrDate(dataLine),
      jobType: /est[aá]gio|trainee/i.test(title) ? "internship" : "full-time",
      ats: "apinfo",
      workplace: remote ? "remote" : /h[ií]brido|hybrid/i.test(`${title} ${description}`) ? "hybrid" : "unknown",
    });
  }
  return jobs;
}

function extractPkey(html) {
  return (
    html.match(/name=["']pkey["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']pkey["']/i)?.[1] ||
    ""
  );
}

function extractResultTcv(html) {
  const tcvs = [...html.matchAll(/name=["']tcv["'][^>]*value=["'](\d+)["']/gi)].map(
    (m) => m[1]
  );
  return tcvs.find((v) => v !== "1") || tcvs[0] || "972";
}

async function postList(fields) {
  const res = await fetch("https://www.apinfo.com/apinfo/inc/list4.cfm", {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://www.apinfo.com/apinfo/inc/list4.cfm",
    },
    body: new URLSearchParams(fields),
  });
  if (!res.ok) throw new Error(`ApInfo HTTP ${res.status}`);
  return readHtml(res);
}

function pageCount(html) {
  // Encoding may garble "Página" → match loose "…gina 1 de N"
  const m =
    html.match(/gina\s+\d+\s+de\s+(\d+)/i) ||
    html.match(/P[aá]gina\s+\d+\s+de\s+(\d+)/i);
  return m ? Math.min(Number(m[1]) || 1, 60) : 1;
}

async function scrapeKeyword(keyw, maxPages = 20) {
  // First hit: search form (tcv=1). Later pages need pkey + result tcv (~972).
  let html = await postList({
    tcv: "1",
    pag: "1",
    keyw: keyw || "",
    ddmmaa1: "",
    ddmmaa2: "",
    onde: "2",
    andor: "2",
  });
  const total = Math.min(pageCount(html), maxPages);
  const all = parseBoxes(html);
  let pkey = extractPkey(html);
  let tcv = extractResultTcv(html);
  console.log(`  "${keyw || "(all)"}" page 1/${total} → ${all.length}`);

  for (let pag = 2; pag <= total; pag++) {
    await new Promise((r) => setTimeout(r, 280));
    html = await postList({
      tcv,
      pag: String(pag),
      keyw: keyw || "",
      pkey,
    });
    const jobs = parseBoxes(html);
    console.log(`  "${keyw || "(all)"}" page ${pag}/${total} → ${jobs.length}`);
    all.push(...jobs);
    pkey = extractPkey(html) || pkey;
    tcv = extractResultTcv(html) || tcv;
    if (!jobs.length) break;
  }
  return all;
}

// Broad crawl of recent listings + focused keyword pages
const terms = [
  { keyw: "", pages: 40 }, // ~122 pages exist; 40 ≈ 320 recent jobs
  { keyw: "Home Office", pages: 15 },
  { keyw: ".NET", pages: 8 },
  { keyw: "C#", pages: 4 },
  { keyw: "Java", pages: 8 },
  { keyw: "React", pages: 4 },
  { keyw: "Python", pages: 4 },
  { keyw: "DevOps", pages: 3 },
  { keyw: "SAP", pages: 5 },
];

const all = [];
console.log("Fetching ApInfo…");

// Homepage featured
try {
  const home = await fetch("https://www.apinfo.com/", {
    headers: { "User-Agent": UA },
  }).then((r) => readHtml(r));
  const featured = [...home.matchAll(/list44\.cfm\?codvaga=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(
    (m) => ({
      id: `apinfo:${m[1]}`,
      title: stripHtml(m[2]),
      company: "ApInfo",
      url: `https://www.apinfo.com/apinfo/inc/${m[0].match(/list44\.cfm[^"']*/i)[0].replace(/&amp;/g, "&")}`,
      description: `${stripHtml(m[2])}. Destaque ApInfo.`,
      location: "Brasil",
      tags: ["apinfo", "brazil", "ti", "featured"],
      postedAt: new Date().toISOString(),
      ats: "apinfo",
      workplace: "unknown",
    })
  );
  console.log("homepage featured", featured.length);
  all.push(...featured.filter((j) => j.title));
} catch (e) {
  console.warn("homepage", e.message);
}

for (const { keyw, pages } of terms) {
  try {
    const jobs = await scrapeKeyword(keyw, pages);
    all.push(...jobs);
  } catch (e) {
    console.warn("term failed", keyw, e.message);
  }
}

const seen = new Set();
const jobs = [];
for (const j of all) {
  if (!j.title || seen.has(j.id)) continue;
  seen.add(j.id);
  jobs.push(j);
}

const payload = {
  generatedAt: new Date().toISOString(),
  count: jobs.length,
  jobs,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Wrote ${jobs.length} ApInfo jobs → data/apinfo-jobs.json`);
