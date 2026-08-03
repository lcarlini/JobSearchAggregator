/** Google / LinkedIn / Indeed operators + recipes + site tips. */

import { keywordQuery } from "./sources/deeplinks.js";

function enc(s) {
  return encodeURIComponent(s || "");
}

function stackOr(filters) {
  const kw = keywordQuery(filters);
  const parts = kw
    .split(/\s+OR\s+/)
    .map((s) => s.replace(/"/g, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  if (parts.length <= 1) return parts[0] || ".NET";
  return `(${parts.join(" OR ")})`;
}

export const OPERATOR_DOCS = {
  google: [
    { op: '"frase exata"', tipKey: "hackExact" },
    { op: "-palavra", tipKey: "hackExclude" },
    { op: "site:linkedin.com", tipKey: "hackSite" },
    { op: "filetype:pdf", tipKey: "hackFiletype" },
    { op: "intitle:palavra", tipKey: "hackIntitle" },
    { op: "intext:palavra", tipKey: "hackIntext" },
    { op: "inurl:palavra", tipKey: "hackInurl" },
    { op: "related:site.com", tipKey: "hackRelated" },
    { op: "*", tipKey: "hackWildcard" },
    { op: "OR / AND / ( )", tipKey: "hackBoolean" },
    { op: "before:2025 / after:2024", tipKey: "hackDate" },
    { op: "500..1000", tipKey: "hackRange" },
  ],
  linkedin: [
    { op: "AND / OR / NOT", tipKey: "hackLiBoolean" },
    { op: '" "', tipKey: "hackExact" },
    { op: "*", tipKey: "hackWildcard" },
    { op: "title:palavra", tipKey: "hackLiTitle" },
    { op: "company:empresa", tipKey: "hackLiCompany" },
    { op: "past:empresa", tipKey: "hackLiPast" },
    { op: "location:cidade", tipKey: "hackLiLocation" },
    { op: "school:universidade", tipKey: "hackLiSchool" },
    { op: "f_TPR=r7200", tipKey: "hackLi2h" },
    { op: "f_TPR=r28800", tipKey: "hackLi8h" },
    { op: "f_TPR=r86400", tipKey: "hackLi24h" },
    { op: "f_WT=2", tipKey: "hackLiRemote" },
    { op: "f_JIYN=true", tipKey: "hackLiUnder10" },
    { op: "sortBy=DD", tipKey: "hackLiSort" },
    { op: "geoId=106057199", tipKey: "hackLiGeoBr" },
    { op: "NOT Recruitment", tipKey: "hackLiNoAgency" },
    { op: "Easy Apply", tipKey: "hackLiEasy" },
    { op: "Alerts + hashtags", tipKey: "hackLiAlerts" },
  ],
  indeed: [
    { op: '"full stack"', tipKey: "hackExact" },
    { op: "-estágio", tipKey: "hackExclude" },
    { op: "fromage=1 / 7 / 30", tipKey: "hackIndeed24h" },
    { op: "Trabalho remoto", tipKey: "hackIndeedRemote" },
    { op: "C# AND .NET AND Azure", tipKey: "hackBoolean" },
    { op: "desenvolvedor*", tipKey: "hackWildcard" },
    { op: "Indeed Alerts", tipKey: "hackIndeedAlerts" },
  ],
};

/** Tips for specialized boards */
export const SITE_HACKS = [
  {
    id: "apinfo",
    name: "ApInfo",
    tips: ["siteHackApinfo1", "siteHackApinfo2", "siteHackApinfo3"],
    url: "https://www.apinfo.com/",
  },
  {
    id: "remoteok",
    name: "Remote OK",
    tips: ["siteHackRemoteOk1", "siteHackRemoteOk2", "siteHackRemoteOk3"],
    url: "https://remoteok.com/",
  },
  {
    id: "wwr",
    name: "We Work Remotely",
    tips: ["siteHackWwr1", "siteHackWwr2"],
    url: "https://weworkremotely.com/",
  },
  {
    id: "wellfound",
    name: "Wellfound / AngelList",
    tips: ["siteHackWellfound1", "siteHackWellfound2", "siteHackWellfound3"],
    url: "https://wellfound.com/jobs",
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    tips: ["siteHackGlassdoor1", "siteHackGlassdoor2", "siteHackGlassdoor3"],
    url: "https://www.glassdoor.com.br/",
  },
];

export const EXTRA_TIPS = [
  "tipF12",
  "tipCombine",
  "tipMonitor",
  "tipWildcard",
  "tipExclude",
  "tipAlerts",
];

export function buildSearchRecipes(filters = {}) {
  const stack = stackOr(filters);
  const after =
    filters.recency && filters.recency !== "any"
      ? (() => {
          const days = { "2h": 1, "8h": 1, "24h": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30 }[
            filters.recency
          ];
          if (!days) return "";
          const d = new Date(Date.now() - days * 86400000);
          return `after:${d.toISOString().slice(0, 10)}`;
        })()
      : "";

  const excludeJunior =
    filters.seniority === "senior" || filters.seniority === "senior+" || filters.seniority === "staff"
      ? " -junior -estágio -trainee"
      : "";

  const liPeople = `title:(senior OR lead) AND ${stack} AND location:(Brasil OR "Remote" OR Brazil)`;
  const liJobsKw = `${stack} AND (remote OR "remote first" OR "home office")${excludeJunior}`;
  const liBoolean = `title:(senior OR lead) AND ${stack} AND (Azure OR AWS) AND location:(Brasil OR "Remote")`;
  const liCompanies = `company:(Nubank OR iFood OR Stone OR "Mercado Livre") AND title:engineer`;
  const liOpen = `#opentowork OR "open to work" AND ${stack}`;

  const recipes = [
    {
      id: "g-linkedin-jobs",
      platform: "Google",
      titleKey: "recipeGLiJobs",
      query: `site:linkedin.com/jobs ${stack} AND "remote" AND ("Brazil" OR Brasil)${excludeJunior} ${after}`.trim(),
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-linkedin-dotnet",
      platform: "Google",
      titleKey: "recipeGLiDotnet",
      query: `site:linkedin.com/jobs "senior .NET developer" AND "remote" AND "Brazil" -hybrid ${after}`.trim(),
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-linkedin-home",
      platform: "Google",
      titleKey: "recipeGLiHome",
      query: `site:linkedin.com/jobs ".NET developer" AND "home office"`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-indeed-br",
      platform: "Google",
      titleKey: "recipeGIndeed",
      query: `site:indeed.com.br ${stack} AND (remoto OR "home office" OR "São Paulo") ${after}`.trim(),
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-indeed-us",
      platform: "Google",
      titleKey: "recipeGIndeedUs",
      query: `site:indeed.com "full stack" AND ".NET" AND "remote"`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-remotar",
      platform: "Google",
      titleKey: "recipeGRemotar",
      query: `site:remotar.com.br ${stack} AND (senior OR pleno OR backend)`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-apinfo",
      platform: "Google",
      titleKey: "recipeGApinfo",
      query: `site:apinfo.com ${stack} AND (remoto OR "home office" OR CLT OR PJ)`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-remoteok",
      platform: "Google",
      titleKey: "recipeGRemoteOk",
      query: `site:remoteok.com ${stack} AND remote AND (Brazil OR worldwide)`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-wwr",
      platform: "Google",
      titleKey: "recipeGWwr",
      query: `site:weworkremotely.com backend AND (Brazil OR remote) AND ${stack}`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "li-boolean-jobs",
      platform: "LinkedIn",
      titleKey: "recipeLiJobs",
      query: liJobsKw,
      url: (q) => {
        const p = new URLSearchParams({ keywords: q, f_WT: "2", f_TPR: "r86400" });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "li-boolean-adv",
      platform: "LinkedIn",
      titleKey: "recipeLiAdv",
      query: liBoolean,
      url: (q) => {
        const p = new URLSearchParams({ keywords: q, f_WT: "2", f_TPR: "r86400" });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "li-2h",
      platform: "LinkedIn",
      titleKey: "recipeLi2h",
      query: liJobsKw,
      url: (q) => {
        const p = new URLSearchParams({
          keywords: `${q} NOT Recruitment NOT Staffing`,
          f_WT: "2",
          f_TPR: "r7200",
          sortBy: "DD",
        });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "li-8h",
      platform: "LinkedIn",
      titleKey: "recipeLi8h",
      query: liJobsKw,
      url: (q) => {
        const p = new URLSearchParams({
          keywords: `${q} NOT Recruitment`,
          f_WT: "2",
          f_TPR: "r28800",
          sortBy: "DD",
        });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "li-under10",
      platform: "LinkedIn",
      titleKey: "recipeLiUnder10",
      query: liJobsKw,
      url: (q) => {
        const p = new URLSearchParams({
          keywords: `${q} NOT Recruitment`,
          f_WT: "2",
          f_TPR: "r604800",
          f_JIYN: "true",
          sortBy: "DD",
        });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "li-br-geoid",
      platform: "LinkedIn",
      titleKey: "recipeLiBrGeo",
      query: liJobsKw,
      url: (q) => {
        const p = new URLSearchParams({
          keywords: `${q} NOT Recruitment`,
          f_WT: "2",
          f_TPR: "r86400",
          geoId: "106057199",
          location: "Brazil",
          sortBy: "DD",
        });
        return `https://www.linkedin.com/jobs/search/?${p}`;
      },
    },
    {
      id: "g-gupy",
      platform: "Google",
      titleKey: "recipeGGupy",
      query: `site:portal.gupy.io ${stack} AND (remoto OR remote OR "home office")`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "g-posts-hiring",
      platform: "Google",
      titleKey: "recipeGPostsHiring",
      query: `site:linkedin.com/posts hiring ${stack} remote (Brazil OR Brasil OR LATAM) after:${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}`,
      url: (q) => `https://www.google.com/search?q=${enc(q)}`,
    },
    {
      id: "li-people",
      platform: "LinkedIn",
      titleKey: "recipeLiPeople",
      query: liPeople,
      url: (q) => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`,
    },
    {
      id: "li-br-companies",
      platform: "LinkedIn",
      titleKey: "recipeLiBrCos",
      query: liCompanies,
      url: (q) => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`,
    },
    {
      id: "li-opentowork",
      platform: "LinkedIn",
      titleKey: "recipeLiOpen",
      query: liOpen,
      url: (q) => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`,
    },
    {
      id: "indeed-br",
      platform: "Indeed",
      titleKey: "recipeIndeedBr",
      query: `${stack} AND remote -estágio -junior`,
      url: (q) =>
        `https://br.indeed.com/jobs?q=${enc(q)}&l=Remoto&fromage=1&remotejob=032`,
    },
    {
      id: "indeed-home",
      platform: "Indeed",
      titleKey: "recipeIndeedHome",
      query: `${stack} AND senior AND "home office"`,
      url: (q) =>
        `https://br.indeed.com/jobs?q=${enc(q)}&l=Home+Office&fromage=7`,
    },
    {
      id: "apinfo-direct",
      platform: "ApInfo",
      titleKey: "recipeApinfo",
      query: `${stack} home office`,
      url: () => "https://www.apinfo.com/",
    },
    {
      id: "alerts-google",
      platform: "Alerts",
      titleKey: "recipeAlert",
      query: `vaga ${stack} remote Brazil OR Brasil`,
      url: (q) =>
        `https://www.google.com/alerts?q=${enc(q)}&hl=${filters.language === "en" ? "en" : "pt-BR"}`,
    },
  ];

  return recipes.map((r) => ({
    ...r,
    url: typeof r.url === "function" ? r.url(r.query) : r.url,
  }));
}
