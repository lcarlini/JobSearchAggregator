/** Build external search URLs with advanced filters (no scraping). */

function enc(s) {
  return encodeURIComponent(s || "");
}

export function keywordQuery(filters) {
  const parts = [];
  if (filters.keywords) parts.push(filters.keywords.replace(/,/g, " OR "));
  if (filters.titleInclude) {
    for (const t of String(filters.titleInclude).split(/[,;]+/).filter(Boolean)) {
      parts.push(`"${t.trim()}"`);
    }
  }
  if (filters.titleExclude) {
    for (const t of String(filters.titleExclude).split(/[,;]+/).filter(Boolean)) {
      parts.push(`-"${t.trim()}"`);
    }
  }
  return parts.join(" ").trim() || "software engineer remote";
}

function linkedInTpr(recency) {
  return {
    "2h": "r7200",
    "8h": "r28800",
    "24h": "r86400",
    "3d": "r259200",
    "7d": "r604800",
    "30d": "r2592000",
  }[recency] || "";
}

function linkedInJobType(jobType) {
  return {
    "full-time": "F",
    freelance: "C",
    "part-time": "P",
    internship: "I",
  }[jobType] || "";
}

function geoLocation(geo) {
  return {
    brazil: "Brazil",
    latam: "Latin America",
    worldwide: "Worldwide",
    "uk-br": "United Kingdom",
    "au-br": "Australia",
    europe: "Europe",
    us: "United States",
  }[geo] || "";
}

function indeedHost(geo) {
  if (geo === "brazil" || geo === "latam") return "https://br.indeed.com";
  if (geo === "uk-br") return "https://uk.indeed.com";
  if (geo === "au-br") return "https://au.indeed.com";
  return "https://www.indeed.com";
}

function indeedFromage(recency) {
  return { "24h": "1", "3d": "3", "7d": "7", "30d": "30", "2h": "1", "8h": "1" }[
    recency
  ] || "";
}

function googleAfter(recency) {
  const days = { "24h": 1, "3d": 3, "7d": 7, "30d": 30, "2h": 1, "8h": 1 }[recency];
  if (!days) return "";
  const d = new Date(Date.now() - days * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `after:${y}-${m}-${day}`;
}

function latamClause(filters) {
  if (filters.geo === "latam" || filters.latamOnly || filters.geo === "brazil") {
    return '("Brazil" OR Brasil OR LATAM OR "Latin America" OR "work from anywhere" OR Worldwide)';
  }
  if (filters.geo === "uk-br") {
    return '("United Kingdom" OR London) (Brazil OR Brasil OR LATAM OR "work from anywhere" OR Worldwide OR remote)';
  }
  if (filters.geo === "au-br") {
    return "(Australia OR Sydney OR Melbourne) (Brazil OR Brasil OR LATAM OR anywhere OR Worldwide OR remote)";
  }
  return "remote";
}

function push(links, id, name, url, description, group) {
  links.push({ id, name, url, description, group });
}

/**
 * @param {object} filters
 * @returns {{ id: string, name: string, url: string, description: string, group: string }[]}
 */
export function buildDeepLinks(filters = {}) {
  const q = keywordQuery(filters);
  const loc = geoLocation(filters.geo);
  const links = [];
  const firstKw = (q.split(/\s+OR\s+|\s+/)[0] || "dev").replace(/"/g, "");

  // —— Primary search engines ——
  {
    const params = new URLSearchParams();
    // Keep keywords tight (LinkedIn ignores OR-heavy synonym dumps)
    const liKw = (filters.keywords || q).split(/[,;]+/)[0]?.trim() || q;
    params.set("keywords", liKw);
    // Latin America as location often returns almost nothing — prefer blank or Brazil
    if (filters.geo === "brazil") params.set("location", "Brazil");
    else if (filters.geo === "us") params.set("location", "United States");
    else if (filters.geo === "europe") params.set("location", "Europe");
    else if (loc && filters.geo !== "latam" && filters.geo !== "worldwide") {
      params.set("location", loc);
    }
    // 1=onsite 2=remote 3=hybrid
    const wt =
      filters.workplace === "onsite" ? "1" : filters.workplace === "hybrid" ? "3" : "2";
    params.set("f_WT", wt);
    const tpr = linkedInTpr(filters.recency) || linkedInTpr("24h");
    if (tpr) params.set("f_TPR", tpr);
    const jt = linkedInJobType(filters.jobType);
    if (jt) params.set("f_JT", jt);
    if (filters.seniority === "junior") params.set("f_E", "2");
    if (filters.seniority === "mid") params.set("f_E", "3");
    if (filters.seniority === "senior" || filters.seniority === "senior+") {
      params.set("f_E", "4");
    }
    push(
      links,
      "linkedin",
      "LinkedIn",
      `https://www.linkedin.com/jobs/search/?${params}`,
      "Remote + f_TPR (como na busca LinkedIn) — abre centenas de vagas",
      "primary"
    );
    const br = new URLSearchParams(params);
    br.set("location", "Brazil");
    push(
      links,
      "linkedin-br",
      "LinkedIn Jobs BR",
      `https://www.linkedin.com/jobs/search/?${br}`,
      "LinkedIn + location Brazil + remote",
      "brazil"
    );
  }

  {
    const host = indeedHost(filters.geo);
    const params = new URLSearchParams();
    let iq = q;
    if (filters.geo === "latam" || filters.latamOnly || filters.geo === "brazil") {
      iq += " remoto OR remote OR home office";
    }
    params.set("q", iq);
    params.set("l", loc || "Remoto");
    const fromage = indeedFromage(filters.recency);
    if (fromage) params.set("fromage", fromage);
    params.set("remotejob", "032");
    push(
      links,
      "indeed",
      "Indeed",
      `${host}/jobs?${params}`,
      "Country TLD + fromage + remote",
      "primary"
    );
    push(
      links,
      "indeed-br-remoto",
      "Indeed BR Remoto",
      `https://br.indeed.com/q-trabalho-remoto-vagas.html?q=${enc(q)}&fromage=${fromage || ""}`,
      "Indeed Brazil remote landing",
      "brazil"
    );
  }

  {
    const parts = [q, "remote", latamClause(filters), "jobs"];
    if (filters.language === "pt") parts.push("português OR portugues OR Brasil");
    if (filters.language === "en") parts.push("English");
    if (filters.jobType === "freelance") parts.push("freelance OR contractor OR contract");
    if (filters.jobType === "full-time") parts.push('"full time" OR "full-time" OR CLT');
    if (filters.descInclude) parts.push(filters.descInclude);
    if (filters.descExclude) {
      for (const t of String(filters.descExclude).split(/[,;]+/).filter(Boolean)) {
        parts.push(`-"${t.trim()}"`);
      }
    }
    const after = googleAfter(filters.recency);
    if (after) parts.push(after);
    const query = parts.filter(Boolean).join(" ");
    push(
      links,
      "googlejobs",
      "Google Jobs",
      `https://www.google.com/search?q=${enc(query)}&ibp=htl;jobs`,
      "after: + LATAM/BR clauses",
      "primary"
    );
  }

  // —— Brasil ——
  const brazilBoards = [
    [
      "apinfo",
      "ApInfo ★",
      `https://www.apinfo.com/apinfo/inc/list4.cfm`,
      `TI BR — busque "${firstKw}" no formulário (home office, CLT/PJ)`,
    ],
    [
      "apinfo-home",
      "ApInfo Home",
      "https://www.apinfo.com/",
      "Destaques e busca rápida no topo",
    ],
    ["remotar", "Remotar", `https://remotar.com.br/?s=${enc(q)}`, "Board remoto BR"],
    ["meuhome", "MeuHome", "https://www.meuhome.com.br/", "Home office BR"],
    ["123vagas", "123Vagas", "https://www.123vagas.com.br/vagas/remoto", "Vagas remotas BR"],
    ["programathor", "Programathor", `https://programathor.com.br/jobs?search=${enc(q)}`, "TI Brasil"],
    ["geekhunter", "GeekHunter", "https://geekhunter.com.br/", "Tech recruiting BR"],
    ["revelo", "Revelo", "https://revelo.com.br/", "Talento tech BR"],
    ["trampos", "Trampos.co", `https://trampos.co/oportunidades?q=${enc(q)}`, "Criativo & tech BR"],
    ["gupy", "Gupy Remote", `https://portal.gupy.io/job-search/term=${enc(q)}&workplaceTypes[]=remote`, "ATS corporativo BR remoto"],
    ["remoters-br", "Remoters Brasil", "https://remoters.com.br/", "Remoto BR"],
    ["crowd", "Crowd", "https://crowd.br.com/", "Freelance/tech BR"],
    ["99freelas", "99Freelas", `https://www.99freelas.com.br/projects?q=${enc(q)}`, "Freelance BR"],
    ["vagasremotas", "Vagas Remotas", "https://vagasremotas.com.br/", "Aggregator BR"],
    ["jobatus", "Jobatus", "https://www.jobatus.com.br/", "Vagas BR"],
    ["infojobs", "InfoJobs", `https://www.infojobs.com.br/vagas-de-emprego-${enc(firstKw)}.aspx`, "Board BR"],
    ["catho", "Catho", `https://www.catho.com.br/vagas/?q=${enc(q)}`, "Board geral BR"],
    ["glassdoor-br", "Glassdoor BR", `https://www.glassdoor.com.br/Vaga/remote-${enc(firstKw)}-vagas-SRCH_KO0,6.htm`, "Salários + reviews BR"],
  ];
  for (const [id, name, url, desc] of brazilBoards) {
    push(links, id, name, url, desc, "brazil");
  }

  // —— Internacionais ——
  const intl = [
    ["remoteok-web", "Remote OK", `https://remoteok.com/remote-${enc(firstKw)}-jobs`, "Stack + salary filters"],
    ["weworkremotely", "We Work Remotely", `https://weworkremotely.com/remote-jobs/search?term=${enc(q)}`, "Programming & design"],
    ["flexjobs", "FlexJobs", `https://www.flexjobs.com/search?search=${enc(q)}&location=Remote`, "Vetted remote"],
    ["wellfound", "Wellfound", `https://wellfound.com/jobs?remote=true&query=${enc(q)}`, "Startups / AngelList"],
    ["himalayas-web", "Himalayas", `https://himalayas.app/jobs?query=${enc(q)}`, "Remote tech"],
    ["remote-com", "Remote.com/jobs", "https://remote.com/jobs", "Remote.com careers"],
    ["workingnomads", "Working Nomads", `https://www.workingnomads.com/jobs?category=development&search=${enc(q)}`, "Curated remote"],
    ["remotive-web", "Remotive", `https://remotive.com/remote-jobs/software-dev?search=${enc(q)}`, "Remote software"],
    ["dynamite", "Dynamite Jobs", `https://dynamitejobs.com/?search=${enc(q)}`, "Remote with salary"],
    ["skipthedrive", "SkipTheDrive", `https://www.skipthedrive.com/?s=${enc(q)}`, "Remote listings"],
    ["jobspresso", "Jobspresso", "https://jobspresso.co/", "Curated remote"],
    ["virtualvocations", "Virtual Vocations", "https://www.virtualvocations.com/", "Telecommute"],
    ["lapieza", "La Pieza", "https://lapieza.io/pt", "LATAM tech"],
    ["torre", "Torre.co", `https://torre.co/search/jobs?q=${enc(q)}&remote=true`, "AI matching"],
    ["remoterocketship", "Remote Rocketship", "https://www.remoterocketship.com/br/", "Remote BR focus"],
    ["dailyremote", "DailyRemote", `https://dailyremote.com/?search=${enc(q)}`, "Aggregator"],
    ["euremotejobs", "EU Remote Jobs", "https://euremotejobs.com/", "Europe remote"],
    ["nodesk", "NoDesk", "https://nodesk.co/remote-jobs/", "Remote companies"],
    ["workana", "Workana", `https://www.workana.com/jobs?query=${enc(q)}&language=en,pt`, "LATAM freelance"],
  ];
  for (const [id, name, url, desc] of intl) {
    push(links, id, name, url, desc, "worldwide");
  }

  // —— US companies hiring BR ——
  const usBr = [
    ["tecla", "Tecla", "https://www.tecla.io/pt/join", "US↔LATAM engineers"],
    ["gitlab", "GitLab", "https://about.gitlab.com/careers/", "All-remote pioneer"],
    ["automattic", "Automattic", "https://automattic.com/work-with-us/", "WordPress / remote"],
    ["zapier", "Zapier", "https://zapier.com/jobs", "Remote-first"],
    ["buffer", "Buffer", "https://buffer.com/journey", "Distributed"],
    ["canonical", "Canonical", "https://canonical.com/careers", "Ubuntu / global"],
    ["toptal", "Toptal", "https://www.toptal.com/", "Top freelance"],
    ["braintrust", "Braintrust", "https://www.usebraintrust.com/", "Talent network"],
    ["upwork", "Upwork", `https://www.upwork.com/nx/search/jobs/?q=${enc(q)}`, "Freelance marketplace"],
    ["fiverr", "Fiverr", "https://www.fiverr.com/", "Gig marketplace"],
    ["hnjobs", "Hacker News Jobs", "https://news.ycombinator.com/jobs", "YC / HN whoishiring"],
    ["ycjobs", "Y Combinator Jobs", "https://www.ycombinator.com/jobs", "YC company jobs"],
    ["turing", "Turing", "https://www.turing.com/jobs", "US companies ↔ global"],
    ["vanhack", "VanHack", "https://vanhack.com/jobs", "LATAM → global"],
  ];
  for (const [id, name, url, desc] of usBr) {
    push(links, id, name, url, desc, "us-br");
  }

  // —— EU companies ——
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
    ["reed", "Reed UK", `https://www.reed.co.uk/jobs/${enc(q.replace(/\s+/g, "-").toLowerCase())}-jobs`, "UK board"],
    ["monsteruk", "Monster UK", `https://www.monster.co.uk/jobs/search?q=${enc(q)}&where=Remote`, "UK remote"],
  ];
  for (const [id, name, url, desc] of eu) {
    push(links, id, name, url, desc, "eu-br");
  }

  // —— Australia ——
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

  return links;
}

export function groupDeepLinks(links) {
  const order = ["primary", "brazil", "worldwide", "us-br", "eu-br", "au-br"];
  const labels = {
    primary: "primary",
    brazil: "brazil",
    worldwide: "worldwide",
    "us-br": "usBr",
    "eu-br": "euBr",
    "au-br": "auBr",
  };
  return order
    .map((g) => ({
      id: g,
      labelKey: labels[g],
      links: links.filter((l) => l.group === g),
    }))
    .filter((g) => g.links.length);
}
