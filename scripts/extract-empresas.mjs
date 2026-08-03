#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const input = process.argv[2] || path.join(root, "bookmarks_8_3_26.html");

if (!fs.existsSync(input)) {
  console.error(`Bookmarks not found: ${input}`);
  process.exit(1);
}

const html = fs.readFileSync(input, "utf8");
const lines = html.split(/\r?\n/);
const folderStack = [];
let capture = false;
let depthAt = null;
const links = [];

for (const line of lines) {
  const h3 = line.match(/<H3[^>]*>([^<]+)<\/H3>/i);
  if (h3) {
    const name = h3[1].trim();
    folderStack.push(name);
    if (name.toLowerCase() === "empresas" && !capture) {
      capture = true;
      depthAt = folderStack.length;
    }
    continue;
  }
  if (/<\/DL>/i.test(line)) {
    if (capture && depthAt !== null && folderStack.length <= depthAt) {
      capture = false;
    }
    folderStack.pop();
    continue;
  }
  const a = line.match(/<A[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
  if (a && capture && a[1].startsWith("http")) {
    links.push({
      title: a[2].trim(),
      url: a[1],
      folder: folderStack.join("/"),
    });
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function cleanName(title, host) {
  let n = title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*[|–—-].*$/, "")
    .replace(/:\s*(Overview|Jobs|About|Home|Careers).*$/i, "")
    .trim();
  if (!n || n.length < 2) n = host.replace(/^www\./, "");
  return n.slice(0, 80);
}

const skipHosts = new Set([
  "www.linkedin.com",
  "linkedin.com",
  "br.linkedin.com",
  "www.facebook.com",
  "docs.google.com",
  "www.google.com",
  "www.google.com.br",
  "x.com",
  "twitter.com",
  "web.whatsapp.com",
  "web.telegram.org",
]);

const companyMap = new Map();
for (const { title, url, folder } of links) {
  const host = hostOf(url);
  if (!host || skipHosts.has(host) || host.includes("linkedin.com")) continue;

  // Prefer careers / jobs URLs
  const key = host.replace(/^www\./, "");
  const existing = companyMap.get(key);
  const isCareer =
    /careers|jobs|join|work-with|hiring|vagas|oportunidad/i.test(url) ||
    /careers|jobs|vagas/i.test(title);
  const entry = {
    id: `co-${key.replace(/\W+/g, "-")}`,
    name: cleanName(title, host),
    host: key,
    url,
    folder,
    isCareer: !!isCareer,
  };
  if (!existing) {
    companyMap.set(key, entry);
  } else if (isCareer && !existing.isCareer) {
    companyMap.set(key, entry);
  }
}

const featured = [
  {
    name: "ApInfo",
    url: "https://www.apinfo.com/",
    searchUrl: "https://www.apinfo2.com/apinfo/inc/resultados_pesquisas.cfm",
    region: "brazil",
    type: "board",
    featured: true,
    priority: 1,
    note: "Clássico BR de TI — vagas .NET/Java/SAP, home office e CLT/PJ",
  },
];

const curated = [
  ...featured,
  // Brasil
  { name: "Remotar", url: "https://remotar.com.br/", region: "brazil", type: "board" },
  { name: "MeuHome", url: "https://www.meuhome.com.br/", region: "brazil", type: "board" },
  { name: "123Vagas", url: "https://www.123vagas.com.br/vagas/remoto", region: "brazil", type: "board" },
  { name: "LinkedIn Jobs BR", url: "https://br.linkedin.com/jobs/remoto-vagas", region: "brazil", type: "board" },
  { name: "Indeed BR", url: "https://br.indeed.com/q-trabalho-remoto-vagas.html", region: "brazil", type: "board" },
  { name: "Programathor", url: "https://programathor.com.br/", region: "brazil", type: "board" },
  { name: "GeekHunter", url: "https://geekhunter.com.br/", region: "brazil", type: "board" },
  { name: "Revelo", url: "https://revelo.com.br/", region: "brazil", type: "board" },
  { name: "Trampos.co", url: "https://trampos.co/", region: "brazil", type: "board" },
  { name: "Gupy Remote", url: "https://portal.gupy.io/job-search/workplaceTypes[]=remote", region: "brazil", type: "board" },
  { name: "Remoters Brasil", url: "https://remoters.com.br/", region: "brazil", type: "board" },
  { name: "Crowd", url: "https://crowd.br.com/", region: "brazil", type: "board" },
  { name: "99Freelas", url: "https://www.99freelas.com.br/", region: "brazil", type: "board" },
  { name: "Vagas Remotas", url: "https://vagasremotas.com.br/", region: "brazil", type: "board" },
  { name: "Jobatus", url: "https://www.jobatus.com.br/", region: "brazil", type: "board" },
  { name: "InfoJobs", url: "https://www.infojobs.com.br/", region: "brazil", type: "board" },
  { name: "Catho", url: "https://www.catho.com.br/", region: "brazil", type: "board" },
  { name: "Glassdoor BR", url: "https://www.glassdoor.com.br/", region: "brazil", type: "board" },
  // Internacionais
  { name: "Remote OK", url: "https://remoteok.com/", region: "worldwide", type: "board" },
  { name: "We Work Remotely", url: "https://weworkremotely.com/", region: "worldwide", type: "board" },
  { name: "FlexJobs", url: "https://www.flexjobs.com/", region: "worldwide", type: "board" },
  { name: "Wellfound", url: "https://wellfound.com/jobs", region: "worldwide", type: "board" },
  { name: "AngelList (Wellfound)", url: "https://angel.co/", region: "worldwide", type: "board" },
  { name: "Himalayas", url: "https://himalayas.app/", region: "worldwide", type: "board" },
  { name: "Remote.com Jobs", url: "https://remote.com/jobs", region: "worldwide", type: "board" },
  { name: "Working Nomads", url: "https://www.workingnomads.com/jobs", region: "worldwide", type: "board" },
  { name: "Remotive", url: "https://remotive.com/", region: "worldwide", type: "board" },
  { name: "Dynamite Jobs", url: "https://dynamitejobs.com/", region: "worldwide", type: "board" },
  { name: "SkipTheDrive", url: "https://www.skipthedrive.com/", region: "worldwide", type: "board" },
  { name: "Jobspresso", url: "https://jobspresso.co/", region: "worldwide", type: "board" },
  { name: "Virtual Vocations", url: "https://www.virtualvocations.com/", region: "worldwide", type: "board" },
  { name: "La Pieza", url: "https://lapieza.io/pt", region: "latam", type: "board" },
  { name: "Torre.co", url: "https://torre.co/", region: "worldwide", type: "board" },
  { name: "Remote Rocketship", url: "https://www.remoterocketship.com/br/", region: "worldwide", type: "board" },
  // US hiring BR
  { name: "Tecla", url: "https://www.tecla.io/pt/join", region: "us-br", type: "company" },
  { name: "GitLab", url: "https://about.gitlab.com/careers/", region: "us-br", type: "company" },
  { name: "Automattic", url: "https://automattic.com/work-with-us/", region: "us-br", type: "company" },
  { name: "Zapier", url: "https://zapier.com/jobs", region: "us-br", type: "company" },
  { name: "Buffer", url: "https://buffer.com/journey", region: "us-br", type: "company" },
  { name: "Canonical", url: "https://canonical.com/careers", region: "us-br", type: "company" },
  { name: "Toptal", url: "https://www.toptal.com/", region: "us-br", type: "company" },
  { name: "Braintrust", url: "https://www.usebraintrust.com/", region: "us-br", type: "company" },
  { name: "Upwork", url: "https://www.upwork.com/", region: "us-br", type: "board" },
  { name: "Fiverr", url: "https://www.fiverr.com/", region: "us-br", type: "board" },
  { name: "Hacker News Jobs", url: "https://news.ycombinator.com/jobs", region: "us-br", type: "board" },
  { name: "Y Combinator Jobs", url: "https://www.ycombinator.com/jobs", region: "us-br", type: "board" },
  // EU
  { name: "Spotify", url: "https://www.spotifyjobs.com/", region: "eu-br", type: "company" },
  { name: "Klarna", url: "https://klarna.com/careers/", region: "eu-br", type: "company" },
  { name: "Revolut", url: "https://www.revolut.com/careers", region: "eu-br", type: "company" },
  { name: "N26", url: "https://n26.com/en/careers", region: "eu-br", type: "company" },
  { name: "Wise", url: "https://wise.com/en/careers", region: "eu-br", type: "company" },
  { name: "Personio", url: "https://www.personio.com/careers/", region: "eu-br", type: "company" },
  { name: "Contentful", url: "https://www.contentful.com/careers/", region: "eu-br", type: "company" },
  { name: "UIPath", url: "https://www.uipath.com/company/careers", region: "eu-br", type: "company" },
  { name: "OutSystems", url: "https://www.outsystems.com/careers/", region: "eu-br", type: "company" },
  { name: "Farfetch", url: "https://www.farfetchgroup.com/careers", region: "eu-br", type: "company" },
  // AU
  { name: "Atlassian", url: "https://www.atlassian.com/company/careers", region: "au-br", type: "company" },
  { name: "Canva", url: "https://www.canva.com/careers/", region: "au-br", type: "company" },
  { name: "Xero", url: "https://www.xero.com/au/about/careers/", region: "au-br", type: "company" },
  { name: "Afterpay", url: "https://www.afterpay.com/careers", region: "au-br", type: "company" },
  { name: "Culture Amp", url: "https://www.cultureamp.com/about/careers", region: "au-br", type: "company" },
  { name: "Envato", url: "https://envato.com/about/careers", region: "au-br", type: "company" },
  { name: "SafetyCulture", url: "https://safetyculture.com/careers/", region: "au-br", type: "company" },
];

const bookmarkCompanies = [...companyMap.values()]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    host: c.host,
    region: "bookmark",
    type: c.isCareer ? "company" : "link",
    source: "empresas-bookmark",
  }));

// Merge curated by host
const byHost = new Map();
for (const c of bookmarkCompanies) {
  byHost.set(c.host, c);
}
for (const c of curated) {
  const host = hostOf(c.url).replace(/^www\./, "");
  const id = `co-${host.replace(/\W+/g, "-")}`;
  if (!byHost.has(host)) {
    byHost.set(host, { id, ...c, host, source: "curated" });
  } else {
    const prev = byHost.get(host);
    byHost.set(host, {
      ...prev,
      name: c.name || prev.name,
      url: c.url,
      searchUrl: c.searchUrl || prev.searchUrl,
      region: c.region,
      type: c.type,
      featured: c.featured || prev.featured || false,
      priority: c.priority ?? prev.priority ?? 100,
      note: c.note || prev.note,
      source: prev.source === "empresas-bookmark" ? "bookmark+curated" : "curated",
    });
  }
}

// Special: always elevate ApInfo from bookmark even if host variants differ
for (const [host, c] of byHost) {
  if (/apinfo/i.test(host) || /apinfo/i.test(c.name)) {
    byHost.set(host, {
      ...c,
      name: "ApInfo",
      url: "https://www.apinfo.com/",
      searchUrl: "https://www.apinfo2.com/apinfo/inc/resultados_pesquisas.cfm",
      region: "brazil",
      type: "board",
      featured: true,
      priority: 1,
      note:
        c.note ||
        "Clássico BR de TI — vagas .NET/Java/SAP, home office e CLT/PJ",
      source: c.source?.includes("bookmark") ? "bookmark+curated" : c.source,
    });
  }
}

const companies = [...byHost.values()].sort((a, b) => {
  const pa = a.featured ? a.priority ?? 0 : 1000;
  const pb = b.featured ? b.priority ?? 0 : 1000;
  if (pa !== pb) return pa - pb;
  return a.name.localeCompare(b.name);
});

const payload = {
  generatedAt: new Date().toISOString(),
  source: path.basename(input),
  stats: {
    bookmarkLinks: links.length,
    bookmarkCompanies: bookmarkCompanies.length,
    total: companies.length,
    featured: companies.filter((c) => c.featured).length,
  },
  featured: companies.filter((c) => c.featured),
  companies,
};

const out = path.join(root, "data", "empresas.json");
fs.writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`Wrote ${payload.companies.length} companies → data/empresas.json`);
console.log(JSON.stringify(payload.stats, null, 2));
