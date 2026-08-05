/**
 * Official company career boards surfaced as deeplinks after Search.
 * Prefer real ATS/Workday URLs — not LinkedIn scrape.
 */
export const COMPANY_CAREER_PACK = [
  {
    id: "career-csg-workday",
    name: "CSG Careers",
    url: "https://csgi.wd5.myworkdayjobs.com/CSGCareers",
    description: "Workday · Brazil Remote / global IT",
    region: "latam",
  },
  {
    id: "career-dxc-workday",
    name: "DXC Technology",
    url: "https://dxctechnology.wd1.myworkdayjobs.com/DXCJobs",
    description: "Workday careers",
    region: "worldwide",
  },
  {
    id: "career-planet-workday",
    name: "Planet",
    url: "https://planet.wd3.myworkdayjobs.com/Planet",
    description: "Workday careers",
    region: "worldwide",
  },
  {
    id: "career-fidelity-workday",
    name: "Fidelity Careers",
    url: "https://wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers",
    description: "Workday careers",
    region: "worldwide",
  },
  {
    id: "career-reply-quickin",
    name: "Reply (Quickin)",
    url: "https://jobs.quickin.io/reply/jobs",
    description: "Vagas BR — .NET, dados, SAP, remoto/híbrido",
    region: "brazil",
  },
  {
    id: "career-ifood",
    name: "iFood",
    url: "https://carreiras.ifood.com.br/",
    description: "Careers BR",
    region: "brazil",
  },
  {
    id: "career-nubank",
    name: "Nubank",
    url: "https://international.nubank.com.br/careers/",
    description: "Careers LATAM",
    region: "brazil",
  },
  {
    id: "career-ebanx",
    name: "EBANX",
    url: "https://ebanx.com/careers/",
    description: "Fintech BR / remote",
    region: "brazil",
  },
  {
    id: "career-hotmart",
    name: "Hotmart",
    url: "https://careers.hotmart.com/",
    description: "Careers BR",
    region: "brazil",
  },
  {
    id: "career-stone",
    name: "Stone",
    url: "https://www.stone.com.br/carreiras/",
    description: "Careers BR",
    region: "brazil",
  },
  {
    id: "career-zenvia",
    name: "Zenvia",
    url: "https://www.zenvia.com/carreiras/",
    description: "Careers BR",
    region: "brazil",
  },
  {
    id: "career-ubiminds",
    name: "Ubiminds",
    url: "https://ubiminds.com/careers/",
    description: "LATAM ↔ international",
    region: "latam",
  },
  {
    id: "career-oowlish",
    name: "Oowlish",
    url: "https://jobs.lever.co/oowlish",
    description: "Lever board",
    region: "latam",
  },
  {
    id: "career-jalasoft",
    name: "Jalasoft",
    url: "https://apply.workable.com/jalasoft/",
    description: "Workable board",
    region: "latam",
  },
  {
    id: "career-enroute",
    name: "Enroute",
    url: "https://apply.workable.com/enroute/",
    description: "Workable board",
    region: "latam",
  },
  {
    id: "career-wizeline",
    name: "Wizeline",
    url: "https://www.wizeline.com/careers/",
    description: "Nearshore LATAM",
    region: "latam",
  },
  {
    id: "career-avenga",
    name: "Avenga",
    url: "https://www.avenga.com/careers/",
    description: "Global eng",
    region: "latam",
  },
  {
    id: "career-grafana",
    name: "Grafana Labs",
    url: "https://grafana.com/about/careers/",
    description: "Remote-friendly",
    region: "worldwide",
  },
  {
    id: "career-gitlab",
    name: "GitLab",
    url: "https://about.gitlab.com/jobs/",
    description: "All-remote",
    region: "worldwide",
  },
  {
    id: "career-deel",
    name: "Deel",
    url: "https://jobs.ashbyhq.com/Deel",
    description: "Ashby board",
    region: "worldwide",
  },
  {
    id: "career-talkdesk",
    name: "Talkdesk",
    url: "https://www.talkdesk.com/careers/",
    description: "PT / remote",
    region: "worldwide",
  },
  {
    id: "career-tractian",
    name: "TRACTIAN",
    url: "https://tractian.com/careers",
    description: "BR industrial AI",
    region: "brazil",
  },
  {
    id: "career-neon",
    name: "Neon",
    url: "https://neon.com.br/carreiras",
    description: "Bank BR",
    region: "brazil",
  },
  {
    id: "career-pismo",
    name: "Pismo",
    url: "https://www.pismo.io/careers/",
    description: "Fintech BR",
    region: "brazil",
  },
  {
    id: "career-belvo",
    name: "Belvo",
    url: "https://belvo.com/careers/",
    description: "Open finance LATAM",
    region: "latam",
  },
];

export function careerLinksForFilters(filters = {}) {
  const geos = String(filters.geo || "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wantBr = !geos.length || geos.some((g) => ["brazil", "latam"].includes(g)) || filters.latamOnly;
  const wantWorld = !geos.length || geos.some((g) => ["worldwide", "usa", "europe", "canada"].includes(g));

  return COMPANY_CAREER_PACK.filter((c) => {
    if (c.region === "worldwide") return true;
    if ((c.region === "brazil" || c.region === "latam") && wantBr) return true;
    if (wantWorld && c.region === "worldwide") return true;
    return wantBr && (c.region === "brazil" || c.region === "latam");
  }).map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    description: c.description,
    group: "careers",
  }));
}
