#!/usr/bin/env node
/**
 * Extract Remote folder links from Netscape bookmarks HTML into curated catalogs.
 * Usage: node scripts/extract-bookmarks.mjs [path-to-bookmarks.html]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAtsUrl } from "./lib/ats-url-parse.mjs";
import { normalizeWorkdayBoard } from "./lib/workday.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const input =
  process.argv[2] || path.join(root, "bookmarks_8_3_26.html");

if (!fs.existsSync(input)) {
  console.error(`Bookmarks file not found: ${input}`);
  process.exit(1);
}

const html = fs.readFileSync(input, "utf8");

/** Minimal folder-aware Netscape bookmark walker */
function extractRemote(html) {
  const links = [];
  const folderStack = [];
  let capture = false;
  let depthAtRemote = null;
  let folderDepth = 0;

  const tokenRe =
    /<(DL|H3|A|\/DL)(\s[^>]*)?>|<\/H3>|<\/A>|<DT>/gi;
  let i = 0;
  let pendingH3 = false;
  let h3Buf = "";
  let pendingA = null;
  let aBuf = "";

  // Simpler line-based parse for reliability with this export format
  const lines = html.split(/\r?\n/);
  for (const line of lines) {
    const h3 = line.match(/<H3[^>]*>([^<]+)<\/H3>/i);
    if (h3) {
      const name = h3[1].trim();
      folderStack.push(name);
      if ((name.toLowerCase() === "remote" || name.toLowerCase() === "remoto") && !capture) {
        capture = true;
        depthAtRemote = folderStack.length;
      }
      continue;
    }

    if (/<\/DL>/i.test(line)) {
      if (capture && depthAtRemote !== null && folderStack.length <= depthAtRemote) {
        capture = false;
      }
      folderStack.pop();
      continue;
    }

    const a = line.match(
      /<A[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i
    );
    if (a && capture) {
      const href = a[1];
      const title = a[2].trim();
      if (href.startsWith("http")) {
        links.push({
          title,
          url: href,
          folder: folderStack.join("/"),
        });
      }
    }
  }
  return links;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function slugFromPath(url, index = 0) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[index] || null;
  } catch {
    return null;
  }
}

const links = extractRemote(html);
console.log(`Remote links found: ${links.length}`);

const greenhouse = new Set();
const lever = new Set();
const ashby = new Set();
const workable = new Set();
const boards = new Map();
const skipHosts = new Set([
  "www.linkedin.com",
  "linkedin.com",
  "www.facebook.com",
  "docs.google.com",
  "www.google.com",
  "www.google.com.br",
]);

for (const { title, url } of links) {
  const host = hostOf(url);

  if (host.includes("greenhouse.io")) {
    const slug = slugFromPath(url, 0);
    if (slug && slug !== "embed") greenhouse.add(slug.toLowerCase());
  }
  if (host === "jobs.lever.co") {
    const slug = slugFromPath(url, 0);
    if (slug) lever.add(slug);
  }
  if (host === "jobs.ashbyhq.com") {
    const slug = slugFromPath(url, 0);
    if (slug) ashby.add(slug);
  }
  if (host === "apply.workable.com") {
    const slug = slugFromPath(url, 0);
    if (slug) workable.add(slug.toLowerCase());
  }

  if (!skipHosts.has(host) && !host.includes("linkedin.com")) {
    const key = host;
    if (!boards.has(key)) {
      boards.set(key, {
        host,
        name: title.replace(/\s*[|–—-].*$/, "").trim().slice(0, 80) || host,
        sampleUrl: url,
        count: 0,
      });
    }
    boards.get(key).count += 1;
  }
}

// Curated extra IT-remote companies known for LATAM / Brazil hiring
const curatedGreenhouse = [
  "remotecom",
  "gitlab",
  "hashicorp",
  "datadog",
  "cloudflare",
  "twilio",
  "shopify",
  "stripe",
  "airbnb",
  "discord",
  "figma",
  "notion",
  "airtable",
  "zapier",
  "automattic",
];
const curatedLever = [
  "oowlish",
  "netflix",
  "spotify",
  "palantir",
  "shopify",
];
const curatedAshby = ["Deel", "truelogic", "firstbaseio", "remote"];

for (const s of curatedGreenhouse) greenhouse.add(s.toLowerCase());
for (const s of curatedLever) lever.add(s);
for (const s of curatedAshby) ashby.add(s);

const workday = new Map();
for (const { url } of links) {
  const parsed = parseAtsUrl(url);
  if (!parsed) continue;
  if (parsed.ats === "workday") {
    const b = normalizeWorkdayBoard(parsed.board);
    if (b) workday.set(b.id, b);
  } else if (parsed.ats === "greenhouse" && parsed.slug) greenhouse.add(parsed.slug.toLowerCase());
  else if (parsed.ats === "lever" && parsed.slug) lever.add(parsed.slug);
  else if (parsed.ats === "ashby" && parsed.slug) ashby.add(parsed.slug);
  else if (parsed.ats === "workable" && parsed.slug) workable.add(parsed.slug.toLowerCase());
}

const companies = {
  generatedAt: new Date().toISOString(),
  source: path.basename(input),
  greenhouse: [...greenhouse].sort(),
  lever: [...lever].sort(),
  ashby: [...ashby].sort(),
  workable: [...workable].sort(),
  workday: [...workday.values()].sort((a, b) => a.id.localeCompare(b.id)),
  latamFriendly: [
    "BairesDev",
    "Turing",
    "Toptal",
    "Tecla",
    "VanHack",
    "Revelo",
    "TrueLogic",
    "NearShore",
    "Oowlish",
    "FullStack Labs",
    "Deel",
    "Remotely",
    "OnStrider",
    "Proxify",
    "Andela",
    "Crossover",
    "EPAM Anywhere",
    "Globant",
    "CI&T",
    "Accenture",
  ],
};

const knownJobBoards = [
  {
    id: "remoteok",
    name: "RemoteOK",
    type: "api",
    url: "https://remoteok.com/",
    api: "https://remoteok.com/api",
    region: "worldwide",
    cors: true,
  },
  {
    id: "remotive",
    name: "Remotive",
    type: "api",
    url: "https://remotive.com/remote-jobs",
    api: "https://remotive.com/api/remote-jobs",
    region: "worldwide",
    cors: true,
  },
  {
    id: "arbeitnow",
    name: "Arbeitnow",
    type: "api",
    url: "https://www.arbeitnow.com/",
    api: "https://www.arbeitnow.com/api/job-board-api",
    region: "europe",
    cors: true,
  },
  {
    id: "jobicy",
    name: "Jobicy",
    type: "api",
    url: "https://jobicy.com/",
    api: "https://jobicy.com/api/v2/remote-jobs",
    region: "worldwide",
    cors: true,
  },
  {
    id: "himalayas",
    name: "Himalayas",
    type: "api",
    url: "https://himalayas.app/jobs",
    api: "https://himalayas.app/jobs/api",
    region: "worldwide",
    cors: false,
  },
  {
    id: "themuse",
    name: "The Muse",
    type: "api",
    url: "https://www.themuse.com/search/jobs",
    api: "https://www.themuse.com/api/public/jobs",
    region: "worldwide",
    cors: false,
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    type: "deeplink",
    url: "https://weworkremotely.com/",
    region: "worldwide",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    type: "deeplink",
    url: "https://www.linkedin.com/jobs/",
    region: "worldwide",
    notes: "No public API; deep-links only",
  },
  {
    id: "indeed",
    name: "Indeed",
    type: "deeplink",
    url: "https://www.indeed.com/",
    region: "worldwide",
    notes: "No public scrape; deep-links by country TLD",
  },
  {
    id: "googlejobs",
    name: "Google Jobs",
    type: "deeplink",
    url: "https://www.google.com/search",
    region: "worldwide",
  },
  {
    id: "reed",
    name: "Reed UK",
    type: "deeplink",
    url: "https://www.reed.co.uk/jobs",
    region: "uk",
  },
  {
    id: "workingnomads",
    name: "Working Nomads",
    type: "deeplink",
    url: "https://www.workingnomads.com/jobs",
    region: "worldwide",
  },
  {
    id: "wellfound",
    name: "Wellfound (AngelList)",
    type: "deeplink",
    url: "https://wellfound.com/jobs",
    region: "worldwide",
  },
  {
    id: "workana",
    name: "Workana",
    type: "deeplink",
    url: "https://www.workana.com/",
    region: "latam",
  },
  {
    id: "gupy",
    name: "Gupy",
    type: "deeplink",
    url: "https://portal.gupy.io/",
    region: "brazil",
  },
  {
    id: "programathor",
    name: "Programathor",
    type: "deeplink",
    url: "https://programathor.com.br/",
    region: "brazil",
  },
  {
    id: "geekhunter",
    name: "GeekHunter",
    type: "deeplink",
    url: "https://www.geekhunter.com.br/",
    region: "brazil",
  },
  {
    id: "catho",
    name: "Catho",
    type: "deeplink",
    url: "https://www.catho.com.br/",
    region: "brazil",
  },
  {
    id: "trampos",
    name: "Trampos",
    type: "deeplink",
    url: "https://www.trampos.co/",
    region: "brazil",
  },
  {
    id: "revelo",
    name: "Revelo",
    type: "deeplink",
    url: "https://www.revelo.com.br/",
    region: "brazil",
  },
  {
    id: "vanhack",
    name: "VanHack",
    type: "deeplink",
    url: "https://vanhack.com/",
    region: "latam",
  },
  {
    id: "toptal",
    name: "Toptal",
    type: "deeplink",
    url: "https://www.toptal.com/careers",
    region: "worldwide",
  },
  {
    id: "turing",
    name: "Turing",
    type: "deeplink",
    url: "https://www.turing.com/jobs",
    region: "worldwide",
  },
  {
    id: "flexjobs",
    name: "FlexJobs",
    type: "deeplink",
    url: "https://www.flexjobs.com/",
    region: "worldwide",
  },
  {
    id: "dailyremote",
    name: "DailyRemote",
    type: "deeplink",
    url: "https://dailyremote.com/",
    region: "worldwide",
  },
  {
    id: "euremotejobs",
    name: "EU Remote Jobs",
    type: "deeplink",
    url: "https://euremotejobs.com/",
    region: "europe",
  },
  {
    id: "nodesk",
    name: "NoDesk",
    type: "deeplink",
    url: "https://nodesk.co/remote-jobs/",
    region: "worldwide",
  },
  {
    id: "monsteruk",
    name: "Monster UK",
    type: "deeplink",
    url: "https://www.monster.co.uk/",
    region: "uk",
  },
  {
    id: "static-ats",
    name: "Company ATS (Greenhouse/Lever/Ashby)",
    type: "static",
    url: "./data/ats-jobs.json",
    region: "worldwide",
  },
];

const bookmarkBoards = [...boards.values()]
  .sort((a, b) => b.count - a.count)
  .slice(0, 120)
  .map((b) => ({
    id: `bm-${b.host.replace(/\W+/g, "-")}`,
    name: b.name,
    type: "bookmark",
    url: b.sampleUrl,
    host: b.host,
    hits: b.count,
    region: "unknown",
  }));

const sources = {
  generatedAt: new Date().toISOString(),
  boards: knownJobBoards,
  bookmarkBoards,
  stats: {
    remoteLinks: links.length,
    uniqueHosts: boards.size,
    greenhouse: companies.greenhouse.length,
    lever: companies.lever.length,
    ashby: companies.ashby.length,
    workable: companies.workable.length,
  },
};

const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

/** Preserve hire-signal / discovery keys that extract alone does not rebuild */
const companiesPath = path.join(dataDir, "companies.json");
let mergedCompanies = { ...companies };
try {
  const prev = JSON.parse(fs.readFileSync(companiesPath, "utf8"));
  const uniq = (a, b) =>
    [...new Set([...(a || []), ...(b || [])].filter(Boolean).map(String))].sort((x, y) =>
      x.localeCompare(y)
    );
  for (const key of [
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "smartrecruiters",
    "recruitee",
    "breezy",
    "bamboohr",
    "personio",
    "latamFriendly",
  ]) {
    mergedCompanies[key] = uniq(prev[key], companies[key]);
  }
  const wdMap = new Map();
  for (const raw of [...(prev.workday || []), ...(companies.workday || [])]) {
    const b = normalizeWorkdayBoard(raw);
    if (b) wdMap.set(b.id, b);
  }
  mergedCompanies.workday = [...wdMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  mergedCompanies.source = `${path.basename(input)} + preserved prior ATS keys`;
  mergedCompanies.generatedAt = new Date().toISOString();
} catch {
  mergedCompanies = companies;
}

fs.writeFileSync(companiesPath, JSON.stringify(mergedCompanies, null, 2));
fs.writeFileSync(
  path.join(dataDir, "sources.json"),
  JSON.stringify(sources, null, 2)
);

console.log("Wrote data/companies.json and data/sources.json (extra ATS keys preserved)");
console.log(JSON.stringify(sources.stats, null, 2));
