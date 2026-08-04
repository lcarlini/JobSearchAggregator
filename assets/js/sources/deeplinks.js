/** Build external search URLs with the same filters used in the aggregator. */

function enc(s) {
  return encodeURIComponent(s || "");
}

function splitCsv(value) {
  return String(value || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "any");
}

function hasGeo(filters, ...values) {
  const geos = splitCsv(filters.geo);
  if (filters.latamOnly && values.includes("latam")) return true;
  return values.some((v) => geos.includes(v));
}

function firstGeo(geo) {
  return splitCsv(geo)[0] || "";
}

export function keywordQuery(filters) {
  const parts = [];
  if (filters.keywords) parts.push(filters.keywords.replace(/,/g, " OR "));
  if (filters.exactPhrase) parts.push(`"${String(filters.exactPhrase).trim()}"`);
  if (filters.titleInclude) {
    for (const t of splitCsv(filters.titleInclude)) parts.push(`"${t}"`);
  }
  if (filters.titleExclude) {
    for (const t of splitCsv(filters.titleExclude)) parts.push(`-"${t}"`);
  }
  return parts.join(" ").trim() || "software engineer remote";
}

/** Shared boolean extras applied to LinkedIn / Indeed / Google keyword boxes. */
export function filterQueryExtras(filters = {}) {
  const parts = [];
  const skills = splitCsv(filters.skillsMust);
  if (skills.length) parts.push(skills.map((s) => `"${s}"`).join(" OR "));

  const wps = splitCsv(filters.workplace);
  if (wps.includes("remote") || (!wps.length && filters.workplace !== "onsite")) {
    parts.push("(remote OR remoto OR \"home office\" OR \"work from home\")");
  }
  if (wps.includes("hybrid")) parts.push("(hybrid OR híbrido OR hibrido)");
  if (wps.includes("onsite")) parts.push("(onsite OR \"on-site\" OR presencial)");

  const scopes = splitCsv(filters.remoteScope);
  if (scopes.includes("worldwide") || filters.remotePolicy === "anywhere") {
    parts.push('("work from anywhere" OR worldwide OR "global remote")');
  }
  if (scopes.includes("country") || filters.remotePolicy === "country-restricted") {
    parts.push('("must be located" OR "based in" OR "remote only" OR "within country")');
  }
  if (scopes.includes("region") || filters.remotePolicy === "latam-only" || filters.remotePolicy === "emea-only") {
    parts.push('("LATAM only" OR "EMEA only" OR "Europe only" OR "EU only" OR "APAC only")');
  }

  if (filters.brazilOk || filters.latamOnly || hasGeo(filters, "latam", "brazil")) {
    parts.push('(Brazil OR Brasil OR LATAM OR "Latin America" OR "Brazil OK")');
  }

  const sen = splitCsv(filters.seniority);
  if (sen.some((s) => ["senior", "senior+", "staff", "lead"].includes(s))) {
    parts.push("-junior -estágio -estagio -trainee -intern");
  }
  if (sen.includes("junior")) parts.push("(junior OR jr OR \"entry level\")");
  if (sen.includes("mid")) parts.push("(mid OR pleno OR intermediate)");

  const jts = splitCsv(filters.jobType);
  if (jts.includes("freelance")) parts.push("(freelance OR contractor OR contract OR B2B)");
  if (jts.includes("full-time")) parts.push('("full-time" OR "full time" OR CLT OR permanent)');
  if (jts.includes("internship")) parts.push("(internship OR estágio OR estagio OR trainee)");

  if (filters.engagement === "pj") parts.push("(PJ OR \"pessoa jurídica\" OR CNPJ)");
  if (filters.engagement === "clt") parts.push("CLT");
  if (filters.engagement === "contractor") parts.push("(contractor OR B2B OR contract)");
  if (filters.engagement === "eor") parts.push("(EOR OR Deel OR \"employer of record\")");

  if (filters.language === "pt") parts.push("(português OR portugues OR Brasil)");
  if (filters.language === "en") parts.push("English");
  if (filters.language === "es") parts.push("(español OR espanol OR Spanish)");

  if (filters.company) {
    for (const c of splitCsv(filters.company)) parts.push(`"${c}"`);
  }
  if (filters.noAgency) parts.push('-"Talent Acquisition" -Recruitment -Staffing -agency');

  if (filters.descInclude) {
    for (const t of splitCsv(filters.descInclude)) parts.push(`"${t}"`);
  }
  if (filters.descExclude) {
    for (const t of splitCsv(filters.descExclude)) parts.push(`-"${t}"`);
  }

  return parts.filter(Boolean).join(" ").trim();
}

export function fullSearchQuery(filters = {}) {
  return [keywordQuery(filters), filterQueryExtras(filters)].filter(Boolean).join(" ").trim();
}

function linkedInTpr(recency) {
  return {
    "2h": "r7200",
    "8h": "r28800",
    "24h": "r86400",
    "3d": "r259200",
    "7d": "r604800",
    "14d": "r1209600",
    "30d": "r2592000",
  }[recency] || "";
}

function linkedInJobTypes(jobType) {
  const map = {
    "full-time": "F",
    freelance: "C",
    contract: "C",
    "part-time": "P",
    internship: "I",
  };
  return splitCsv(jobType)
    .map((j) => map[j])
    .filter(Boolean);
}

function linkedInExperience(seniority) {
  const map = {
    internship: "1",
    junior: "2",
    mid: "3",
    senior: "4",
    "senior+": "4",
    staff: "5",
    lead: "4",
  };
  return splitCsv(seniority)
    .map((s) => map[s])
    .filter(Boolean);
}

function geoLocation(geo) {
  const first = firstGeo(geo);
  return {
    brazil: "Brazil",
    latam: "Latin America",
    worldwide: "Worldwide",
    uk: "United Kingdom",
    "uk-br": "United Kingdom",
    "au-br": "Australia",
    australia: "Australia",
    europe: "Europe",
    us: "United States",
    canada: "Canada",
    ca: "Canada",
    nz: "New Zealand",
    "new-zealand": "New Zealand",
    uae: "United Arab Emirates",
    dubai: "Dubai",
    portugal: "Portugal",
    germany: "Germany",
    netherlands: "Netherlands",
    ireland: "Ireland",
    spain: "Spain",
    france: "France",
  }[first] || "";
}

function linkedInGeoId(geo) {
  const g = firstGeo(geo);
  return {
    brazil: "106057199",
    us: "103644278",
    uk: "101165590",
    "uk-br": "101165590",
    canada: "101174742",
    ca: "101174742",
    australia: "101452733",
    "au-br": "101452733",
    germany: "101282230",
    portugal: "100364837",
    netherlands: "102890719",
    ireland: "104738515",
    spain: "105646813",
    france: "105015875",
    nz: "105490917",
    "new-zealand": "105490917",
    uae: "104305776",
    dubai: "104305776",
  }[g] || "";
}

function indeedHost(geo) {
  const g = firstGeo(geo);
  if (g === "brazil" || g === "latam") return "https://br.indeed.com";
  if (g === "uk" || g === "uk-br" || g === "ireland") return "https://uk.indeed.com";
  if (g === "au-br" || g === "australia") return "https://au.indeed.com";
  if (g === "canada" || g === "ca") return "https://ca.indeed.com";
  if (g === "nz" || g === "new-zealand") return "https://nz.indeed.com";
  if (g === "germany") return "https://de.indeed.com";
  if (g === "france") return "https://fr.indeed.com";
  if (g === "spain") return "https://es.indeed.com";
  if (g === "netherlands") return "https://nl.indeed.com";
  if (g === "portugal") return "https://pt.indeed.com";
  if (g === "uae" || g === "dubai") return "https://ae.indeed.com";
  return "https://www.indeed.com";
}

function indeedFromage(recency) {
  return { "24h": "1", "3d": "3", "7d": "7", "14d": "14", "30d": "30", "2h": "1", "8h": "1" }[
    recency
  ] || "";
}

function googleAfter(recency) {
  const days = { "24h": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30, "2h": 1, "8h": 1 }[recency];
  if (!days) return "";
  const d = new Date(Date.now() - days * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `after:${y}-${m}-${day}`;
}

function marketClause(filters) {
  if (hasGeo(filters, "latam", "brazil") || filters.latamOnly || filters.brazilOk) {
    return '("Brazil" OR Brasil OR LATAM OR "Latin America" OR "work from anywhere" OR Worldwide)';
  }
  if (hasGeo(filters, "uk", "uk-br")) {
    return '("United Kingdom" OR London OR UK) (remote OR "work from anywhere" OR Worldwide)';
  }
  if (hasGeo(filters, "au-br", "australia")) {
    return "(Australia OR Sydney OR Melbourne) (remote OR anywhere OR Worldwide)";
  }
  if (hasGeo(filters, "canada", "ca")) {
    return '(Canada OR Toronto OR Vancouver) (remote OR "work from anywhere" OR Worldwide)';
  }
  if (hasGeo(filters, "nz", "new-zealand")) {
    return '("New Zealand" OR Auckland OR Wellington) (remote OR anywhere OR Worldwide)';
  }
  if (hasGeo(filters, "uae", "dubai")) {
    return '(UAE OR Dubai OR "Abu Dhabi" OR "United Arab Emirates") (remote OR anywhere)';
  }
  if (hasGeo(filters, "portugal")) return "(Portugal OR Lisbon OR Lisboa) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "germany")) return "(Germany OR Berlin OR Munich) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "netherlands")) return "(Netherlands OR Amsterdam) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "ireland")) return "(Ireland OR Dublin) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "spain")) return "(Spain OR Madrid OR Barcelona) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "france")) return "(France OR Paris) (remote OR anywhere OR Worldwide)";
  if (hasGeo(filters, "europe")) return '(Europe OR EMEA OR EU) (remote OR "work from anywhere" OR Worldwide)';
  if (hasGeo(filters, "us")) return '("United States" OR USA OR remote) ("work from anywhere" OR remote OR Worldwide)';
  if (hasGeo(filters, "worldwide")) return '("work from anywhere" OR worldwide OR "global remote")';
  return "remote";
}

function linkedInKeywords(filters) {
  const base = keywordQuery(filters);
  const extras = filterQueryExtras(filters);
  let kw = [base, extras].filter(Boolean).join(" ");
  if (filters.noAgency !== false) {
    kw += ' NOT Recruitment NOT Staffing NOT "Talent Acquisition"';
  }
  return kw.trim();
}

/** Shared LinkedIn Jobs URL builder — same filters as the aggregator. */
export function buildLinkedInSearch(filters = {}, overrides = {}) {
  const params = new URLSearchParams();
  params.set("keywords", overrides.keywords || linkedInKeywords(filters));

  const wps = splitCsv(filters.workplace);
  const wtMap = { onsite: "1", remote: "2", hybrid: "3" };
  const wtParts = wps.map((w) => wtMap[w]).filter(Boolean);
  params.set("f_WT", overrides.f_WT || (wtParts.length ? wtParts.join(",") : "2"));

  const tpr =
    overrides.f_TPR ||
    linkedInTpr(filters.recency) ||
    (filters.recency && filters.recency !== "any" ? "" : linkedInTpr("24h"));
  if (tpr) params.set("f_TPR", tpr);
  params.set("sortBy", overrides.sortBy || "DD");

  const jts = linkedInJobTypes(filters.jobType);
  if (jts.length) params.set("f_JT", jts.join(","));

  const exps = linkedInExperience(filters.seniority);
  if (exps.length) params.set("f_E", exps.join(","));

  if (filters.easyApply) params.set("f_AL", "true");

  const loc = overrides.location || geoLocation(filters.geo);
  const geoId = overrides.geoId || linkedInGeoId(filters.geo);
  if (loc && !hasGeo(filters, "latam", "worldwide")) params.set("location", loc);
  else if (overrides.location) params.set("location", overrides.location);
  if (geoId) params.set("geoId", geoId);

  if (overrides.f_JIYN) params.set("f_JIYN", "true");

  return `https://www.linkedin.com/jobs/search/?${params}`;
}

/** Shared Indeed URL builder. */
export function buildIndeedSearch(filters = {}, overrides = {}) {
  const host = overrides.host || indeedHost(filters.geo);
  const params = new URLSearchParams();
  const q = overrides.q || fullSearchQuery(filters);
  params.set("q", q);
  params.set("l", overrides.location || geoLocation(filters.geo) || "Remote");
  const fromage = indeedFromage(filters.recency);
  if (fromage) params.set("fromage", fromage);
  const wps = splitCsv(filters.workplace);
  if (wps.includes("remote") || !wps.length) params.set("remotejob", "032");
  return `${host}/jobs?${params}`;
}

/** Shared Google Jobs URL builder. */
export function buildGoogleJobsSearch(filters = {}) {
  const parts = [
    fullSearchQuery(filters),
    marketClause(filters),
    "jobs",
  ];
  const after = googleAfter(filters.recency);
  if (after) parts.push(after);
  const query = parts.filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${enc(query)}&ibp=htl;jobs`;
}

function glassdoorHost(geo) {
  const g = firstGeo(geo);
  if (g === "brazil" || g === "latam") return "https://www.glassdoor.com.br";
  if (g === "uk" || g === "uk-br") return "https://www.glassdoor.co.uk";
  if (g === "canada" || g === "ca") return "https://www.glassdoor.ca";
  return "https://www.glassdoor.com";
}

export function buildGlassdoorSearch(filters = {}) {
  const host = glassdoorHost(filters.geo);
  const q = keywordQuery(filters).replace(/\s+OR\s+/g, " ");
  const loc = geoLocation(filters.geo) || "Remote";
  return `${host}/Job/jobs.htm?sc.keyword=${enc(q)}&locT=C&locKeyword=${enc(loc)}&remoteWorkType=1`;
}

function push(links, id, name, url, description, group) {
  links.push({ id, name, url, description, group });
}

/**
 * @param {object} filters
 * @returns {{ id: string, name: string, url: string, description: string, group: string }[]}
 */
export function buildDeepLinks(filters = {}) {
  const q = fullSearchQuery(filters);
  const shortQ = keywordQuery(filters);
  const loc = geoLocation(filters.geo);
  const links = [];
  const firstKw = (shortQ.split(/\s+OR\s+|\s+/)[0] || "dev").replace(/"/g, "");

  // —— Primary consolidated platforms (always mirror aggregator filters) ——
  push(
    links,
    "linkedin",
    "LinkedIn",
    buildLinkedInSearch(filters),
    "Mesmos filtros: keywords, remoto, senioridade, tipo, recência, mercado",
    "primary"
  );

  push(
    links,
    "indeed",
    "Indeed",
    buildIndeedSearch(filters),
    "TLD do país + fromage + query com seus filtros",
    "primary"
  );

  push(
    links,
    "googlejobs",
    "Google Jobs",
    buildGoogleJobsSearch(filters),
    "Query completa + mercado + escopo remoto + after:",
    "primary"
  );

  push(
    links,
    "glassdoor",
    "Glassdoor",
    buildGlassdoorSearch(filters),
    "Salários/reviews com keywords + local + remote",
    "primary"
  );

  // LinkedIn BR geoId when Brazil/LATAM selected (or as helper)
  if (hasGeo(filters, "brazil", "latam") || !splitCsv(filters.geo).length) {
    push(
      links,
      "linkedin-br",
      "LinkedIn Jobs BR",
      buildLinkedInSearch(filters, { location: "Brazil", geoId: "106057199" }),
      "geoId Brasil + mesmos filtros",
      "brazil"
    );
  }

  push(
    links,
    "linkedin-under10",
    "LinkedIn <10 applicants",
    buildLinkedInSearch(filters, { f_JIYN: true }),
    "f_JIYN=true — pouca concorrência",
    "primary"
  );

  if (hasGeo(filters, "brazil", "latam")) {
    const fromage = indeedFromage(filters.recency);
    push(
      links,
      "indeed-br-remoto",
      "Indeed BR Remoto",
      `https://br.indeed.com/jobs?q=${enc(q)}&l=Remoto&remotejob=032${fromage ? `&fromage=${fromage}` : ""}`,
      "Indeed Brazil com a mesma query",
      "brazil"
    );
    // Curated LATAM employers — official LinkedIn company job search (no scrape)
    const latamLiCompanies = [
      ["li-co-nubank", "LinkedIn · Nubank", "nubank"],
      ["li-co-ifood", "LinkedIn · iFood", "ifood"],
      ["li-co-ciandt", "LinkedIn · CI&T", "ciandt"],
      ["li-co-globant", "LinkedIn · Globant", "globant"],
      ["li-co-ubiminds", "LinkedIn · Ubiminds", "ubiminds"],
      ["li-co-oowlish", "LinkedIn · Oowlish", "oowlish"],
      ["li-co-deel", "LinkedIn · Deel", "deel"],
      ["li-co-turing", "LinkedIn · Turing", "turing"],
    ];
    for (const [id, name, company] of latamLiCompanies) {
      push(
        links,
        id,
        name,
        `https://www.linkedin.com/jobs/search/?keywords=${enc(shortQ)}&f_C=${enc(company)}&f_WT=2&sortBy=DD`,
        "Empresa LATAM no LinkedIn (busca oficial)",
        "brazil"
      );
    }
  }

  // Always include Canada / NZ / UAE with the same filter builder
  push(links, "linkedin-ca", "LinkedIn Canada", buildLinkedInSearch({ ...filters, geo: "canada" }, { location: "Canada", geoId: "101174742" }), "CA + mesmos filtros", "canada");
  push(links, "indeed-ca", "Indeed Canada", buildIndeedSearch({ ...filters, geo: "canada" }), "CA + mesmos filtros", "canada");
  push(links, "seek-nz", "Seek NZ", `https://www.seek.co.nz/jobs?keywords=${enc(shortQ)}&where=All+New+Zealand`, "NZ board", "nz");
  push(links, "indeed-nz", "Indeed NZ", buildIndeedSearch({ ...filters, geo: "nz" }), "NZ + mesmos filtros", "nz");
  push(links, "bayt", "Bayt", `https://www.bayt.com/en/international/jobs/?keyword=${enc(shortQ)}`, "MENA jobs", "uae");
  push(links, "indeed-ae", "Indeed UAE", buildIndeedSearch({ ...filters, geo: "uae" }), "UAE + mesmos filtros", "uae");
  push(links, "linkedin-ae", "LinkedIn UAE", buildLinkedInSearch({ ...filters, geo: "uae" }, { location: "United Arab Emirates", geoId: "104305776" }), "UAE + mesmos filtros", "uae");

  // —— Brasil ——
  const brazilBoards = [
    ["apinfo", "ApInfo ★", `https://www.apinfo.com/apinfo/inc/list4.cfm`, `TI BR — busque "${firstKw}" (home office, CLT/PJ)`],
    ["apinfo-home", "ApInfo Home", "https://www.apinfo.com/", "Destaques e busca rápida no topo"],
    ["remotar", "Remotar", `https://remotar.com.br/?s=${enc(shortQ)}`, "Curadoria remoto BR"],
    ["jobnagingra", "Job na Gringa", `https://www.jobnagingra.com.br/?s=${enc(shortQ)}`, "Vagas gringa p/ BR"],
    ["vagascom", "Vagas.com", `https://www.vagas.com.br/vagas-de-${enc(firstKw)}?b=remoto`, "Board clássico BR remoto"],
    ["meuhome", "MeuHome", "https://www.meuhome.com.br/", "Home office BR"],
    ["123vagas", "123Vagas", "https://www.123vagas.com.br/vagas/remoto", "Vagas remotas BR"],
    ["programathor", "Programathor", `https://programathor.com.br/jobs?search=${enc(shortQ)}`, "TI Brasil"],
    ["geekhunter", "GeekHunter", "https://geekhunter.com.br/", "Tech recruiting BR"],
    ["revelo", "Revelo", "https://revelo.com.br/", "Talento tech BR"],
    ["trampos", "Trampos.co", `https://trampos.co/oportunidades?q=${enc(shortQ)}`, "Criativo & tech BR"],
    ["gupy", "Gupy Remote", `https://portal.gupy.io/job-search/term=${enc(shortQ)}&workplaceTypes[]=remote`, "ATS corporativo BR remoto"],
    ["remoters-br", "Remoters Brasil", "https://remoters.com.br/", "Remoto BR"],
    ["crowd", "Crowd", "https://crowd.br.com/", "Freelance/tech BR"],
    ["99freelas", "99Freelas", `https://www.99freelas.com.br/projects?q=${enc(shortQ)}`, "Freelance BR"],
    ["vagasremotas", "Vagas Remotas", "https://vagasremotas.com.br/", "Aggregator BR"],
    ["jobatus", "Jobatus", "https://www.jobatus.com.br/", "Vagas BR"],
    ["infojobs", "InfoJobs", `https://www.infojobs.com.br/vagas-de-emprego-${enc(firstKw)}.aspx`, "Board BR"],
    ["catho", "Catho", `https://www.catho.com.br/vagas/empregos/${enc(firstKw)}.html`, "Board geral BR"],
    ["glassdoor-br", "Glassdoor BR", buildGlassdoorSearch({ ...filters, geo: "brazil" }), "Salários + reviews BR"],
  ];
  for (const [id, name, url, desc] of brazilBoards) {
    push(links, id, name, url, desc, "brazil");
  }

  // —— Internacionais ——
  const intl = [
    ["remoteok-web", "Remote OK", `https://remoteok.com/remote-${enc(firstKw)}-jobs`, "Stack + salary filters"],
    ["weworkremotely", "We Work Remotely", `https://weworkremotely.com/remote-jobs/search?term=${enc(shortQ)}`, "Programming & design"],
    ["remotejobsorg-web", "RemoteJobs.org", `https://remotejobs.org/remote-${enc(firstKw)}-jobs`, "API feed + board"],
    ["flexjobs", "FlexJobs", `https://www.flexjobs.com/search?search=${enc(shortQ)}&location=Remote`, "Vetted remote"],
    ["wellfound", "Wellfound", `https://wellfound.com/jobs?remote=true&query=${enc(shortQ)}`, "Startups / AngelList"],
    ["himalayas-web", "Himalayas", `https://himalayas.app/jobs?query=${enc(shortQ)}`, "Remote tech + search API"],
    ["remote-com", "Remote.com/jobs", "https://remote.com/jobs", "Remote.com careers"],
    ["workingnomads", "Working Nomads", `https://www.workingnomads.com/jobs?category=development&search=${enc(shortQ)}`, "Curated remote"],
    ["remotive-web", "Remotive", `https://remotive.com/remote-jobs/software-dev?search=${enc(shortQ)}`, "Remote software"],
    ["dynamite", "Dynamite Jobs", `https://dynamitejobs.com/?search=${enc(shortQ)}`, "Remote with salary"],
    ["skipthedrive", "SkipTheDrive", `https://www.skipthedrive.com/?s=${enc(shortQ)}`, "Remote listings"],
    ["jobspresso", "Jobspresso", "https://jobspresso.co/", "Curated remote"],
    ["virtualvocations", "Virtual Vocations", "https://www.virtualvocations.com/", "Telecommute"],
    ["lapieza", "La Pieza", "https://lapieza.io/pt", "LATAM tech"],
    ["torre", "Torre.co", `https://torre.co/search/jobs?q=${enc(shortQ)}&remote=true`, "AI matching"],
    ["remoterocketship", "Remote Rocketship", "https://www.remoterocketship.com/br/", "Remote BR focus"],
    ["dailyremote", "DailyRemote", `https://dailyremote.com/?search=${enc(shortQ)}`, "Aggregator"],
    ["euremotejobs", "EU Remote Jobs", "https://euremotejobs.com/", "Europe remote"],
    ["nodesk", "NoDesk", "https://nodesk.co/remote-jobs/", "Remote companies"],
    ["workana", "Workana", `https://www.workana.com/jobs?query=${enc(shortQ)}&language=en,pt`, "LATAM freelance"],
    ["jsremotely", "JS Remotely", "https://jsremotely.com/", "JavaScript remote"],
    ["remoteleaf", "Remote Leaf", "https://remoteleaf.com/", "Curated newsletter + jobs"],
    ["authenticjobs", "Authentic Jobs", `https://authenticjobs.com/?search_terms=${enc(shortQ)}`, "Design & creative remote"],
    ["powertofly", "PowerToFly", `https://powertofly.com/career?keywords=${enc(shortQ)}`, "Inclusive remote tech"],
    ["remotees", "RemotEES", "https://remotees.com/", "European remote"],
    ["landingjobs", "Landing.jobs", `https://landing.jobs/offers?q=${enc(shortQ)}&remote=true`, "EU / PT remote"],
    ["relocate-me", "Relocate.me", `https://relocate.me/search?query=${enc(shortQ)}`, "EU relocation + remote"],
  ];
  for (const [id, name, url, desc] of intl) {
    push(links, id, name, url, desc, "worldwide");
  }

  const usBr = [
    ["tecla", "Tecla", "https://www.tecla.io/pt/join", "US↔LATAM engineers"],
    ["gitlab", "GitLab", "https://about.gitlab.com/jobs/", "All-remote pioneer"],
    ["automattic", "Automattic", "https://automattic.com/work-with-us/", "WordPress / remote"],
    ["zapier", "Zapier", "https://zapier.com/jobs", "Remote-first"],
    ["buffer", "Buffer", "https://buffer.com/journey", "Distributed"],
    ["canonical", "Canonical", "https://canonical.com/careers", "Ubuntu / global"],
    ["toptal", "Toptal", "https://www.toptal.com/", "Top freelance"],
    ["braintrust", "Braintrust", "https://www.usebraintrust.com/", "Talent network"],
    ["upwork", "Upwork", `https://www.upwork.com/nx/search/jobs/?q=${enc(shortQ)}`, "Freelance marketplace"],
    ["fiverr", "Fiverr", "https://www.fiverr.com/", "Gig marketplace"],
    ["hnjobs", "Hacker News Jobs", "https://news.ycombinator.com/jobs", "YC / HN whoishiring"],
    ["ycjobs", "Y Combinator Jobs", "https://www.ycombinator.com/jobs", "YC company jobs"],
    ["turing", "Turing", "https://www.turing.com/jobs", "US companies ↔ global"],
    ["vanhack", "VanHack", "https://vanhack.com/jobs", "LATAM → global"],
  ];
  for (const [id, name, url, desc] of usBr) {
    push(links, id, name, url, desc, "us-br");
  }

  const eu = [
    ["spotify", "Spotify", "https://www.spotifyjobs.com/", "EU tech"],
    ["klarna", "Klarna", "https://klarna.com/careers/", "Fintech SE"],
    ["revolut", "Revolut", "https://www.revolut.com/careers", "Fintech UK/EU"],
    ["n26", "N26", "https://n26.com/en/careers", "Bank DE"],
    ["wise", "Wise", "https://wise.com/en/careers", "Fintech UK"],
    ["personio", "Personio", "https://www.personio.com/careers/", "HR tech DE"],
    ["contentful", "Contentful", "https://www.contentful.com/careers/", "CMS remote"],
    ["uipath", "UIPath", "https://www.uipath.com/company/careers", "RPA"],
    ["outsystems", "OutSystems", "https://www.outsystems.com/careers/", "Low-code PT"],
    ["farfetch", "Farfetch", "https://www.farfetchgroup.com/careers", "Fashion tech"],
    ["reed", "Reed UK", `https://www.reed.co.uk/jobs/${enc(firstKw.toLowerCase())}-jobs`, "UK board"],
    ["monsteruk", "Monster UK", `https://www.monster.co.uk/jobs/search?q=${enc(shortQ)}&where=Remote`, "UK remote"],
    ["landingjobs-eu", "Landing.jobs", `https://landing.jobs/offers?q=${enc(shortQ)}&remote=true`, "PT / EU remote"],
    ["relocateme", "Relocate.me", `https://relocate.me/search?query=${enc(shortQ)}`, "EU relocation + remote"],
    ["berlinstartup", "Berlin Startup Jobs", "https://berlinstartupjobs.com/", "DE startups"],
    ["workinstartups", "WorkInStartups", `https://workinstartups.com/?s=${enc(shortQ)}`, "UK startups"],
  ];
  for (const [id, name, url, desc] of eu) {
    push(links, id, name, url, desc, "eu-br");
  }

  const au = [
    ["atlassian", "Atlassian", "https://www.atlassian.com/company/careers", "AU remote-friendly"],
    ["canva", "Canva", "https://www.canva.com/careers/", "AU design/tech"],
    ["xero", "Xero", "https://www.xero.com/au/about/careers/", "Accounting SaaS"],
    ["afterpay", "Afterpay", "https://www.afterpay.com/careers", "BNPL AU"],
    ["cultureamp", "Culture Amp", "https://www.cultureamp.com/about/careers", "HR tech AU"],
    ["envato", "Envato", "https://envato.com/about/careers", "Creative AU"],
    ["safetyculture", "SafetyCulture", "https://safetyculture.com/careers/", "AU SaaS"],
  ];
  for (const [id, name, url, desc] of au) {
    push(links, id, name, url, desc, "au-br");
  }

  push(links, "wellfound-ca", "Wellfound", `https://wellfound.com/jobs?remote=true&query=${enc(shortQ)}`, "Startups remote", "canada");
  push(links, "shopify-careers", "Shopify", "https://www.shopify.com/careers", "CA remote-friendly", "canada");
  push(links, "trademe-jobs", "Trade Me Jobs", `https://www.trademe.co.nz/a/jobs/search?search_string=${enc(shortQ)}`, "NZ marketplace", "nz");
  push(links, "gulftalent", "GulfTalent", `https://www.gulftalent.com/jobs?keywords=${enc(shortQ)}`, "Gulf tech", "uae");

  return links;
}

export function groupDeepLinks(links) {
  const order = ["primary", "brazil", "worldwide", "us-br", "eu-br", "au-br", "canada", "nz", "uae"];
  const labels = {
    primary: "groupPrimary",
    brazil: "groupBrazil",
    worldwide: "groupWorldwide",
    "us-br": "groupUsBr",
    "eu-br": "groupEuBr",
    "au-br": "groupAuBr",
    canada: "groupCanada",
    nz: "groupNz",
    uae: "groupUae",
  };
  return order
    .map((g) => ({
      id: g,
      labelKey: labels[g],
      links: links.filter((l) => l.group === g),
    }))
    .filter((g) => g.links.length);
}
