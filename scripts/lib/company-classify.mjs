/**
 * Heuristic classify LinkedIn-followed orgs: employer | board | agency | skip.
 */

const SKIP_EXACT = new Set(
  [
    "freelance | self-employed",
    "independiente / freelance",
    "self employed",
    "empresa confidencial",
    "fischerafael",
    "mano deyvin",
    "shreya agarwal",
    "monika saleta",
    "mariana völker - rrhh",
    "#careertips by tammy silva",
    "linkedin nieuws",
    "ti inside",
    "entrepreneur stories",
    "business insider advertising",
    "insider, inc.",
    "genai works",
    "dotnet foundation",
    ".net foundation",
    ".net developers",
    "industrial designers society of america (idsa)",
    "cnpq - conselho nacional de desenvolvimento científico e tecnológico",
    "university of utah - david eccles school of business",
  ].map((s) => s.toLowerCase())
);

const BOARD_RE =
  /\b(jobs?|vagas|vacantes|remote(?:ly)?|remoto|careers? board|job board|hiring brazil|find.?job|dailyremote|justremote|working nomads|we work remotely|remotive|wellfound|angellist|flexjobs|dynamite jobs|torre|jobgether|toptal|andela|crossover|lemon\.io|g2i|dice|monster|simplyhired|jooble|powertofly|remote\.com|remotely\.works|findasync|hirelatam|trampar na gringa|jobna ?gringa|geekhunter|revelo|proxify|vanhack|tecla|strider|ontop|braintrust|x-team|turing)\b/i;

const AGENCY_RE =
  /\b(recruit|staffing|talent|rpo|headhunter|head hunter|consulting|consultoria|recursos humanos|\brh\b|people solutions|outsourcing|agency|agenc(y|ia)|placement|resourcing|partners recruitment|nigel frank|robert half|robert walters|adecco|randstad|experis|tek systems|teksystems|kforce|motion recruitment|apex systems|harvey nash|hays|michael page|pagegroup)\b/i;

const EMPLOYER_BOOST_RE =
  /\b(labs?|technologies|tecnologia|software|systems|digital|bank|banco|seguros|health|ai\b|cloud|data|payments?|fintech|saas)\b/i;

export function slugifyCompany(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

export function classifyCompany(name) {
  const n = String(name || "").trim();
  const low = n.toLowerCase();
  if (!n || SKIP_EXACT.has(low)) return { kind: "skip", reason: "noise" };
  if (/^\d+$/.test(n)) return { kind: "skip", reason: "numeric" };

  // Explicit job boards / aggregators
  if (
    BOARD_RE.test(n) ||
    /vagas remotas|home office|quero home|nerdin|latam jobs|remote workmate|vacantes remotas|trabajo en remoto|weremoto|remote talent latam|techjobs360|hired remoteli|remote yeah|remotedevelopers|remotedevelopersbr|remotedevsbr/i.test(
      n
    )
  ) {
    return { kind: "board", reason: "job-board" };
  }

  if (AGENCY_RE.test(n) && !EMPLOYER_BOOST_RE.test(n)) {
    return { kind: "agency", reason: "staffing" };
  }

  // Known mega-employers / product cos often mislabeled by agency regex
  if (
    /\b(ifood|nubank|stone|hotmart|gitlab|github|shopify|stripe|meta|google|microsoft|amazon|apple|netflix|spotify|uber|paypal|adobe|salesforce|atlassian|snowflake|datadog|cloudflare|openai|anthropic|deel|csg|embraer|stefanini|softtek|cognizant|accenture|deloitte|ey\b|wipro|infosys|epam|globant|ci&t|ciandt|avenga|wizeline|oowlish|ubiminds|jalasoft|enroute|tractian|grafana|circle|ebay|workday|personio|hubspot|zapier|automattic|buffer|coinbase|airbnb|booking\.com|farfetch|philips|siemens|adidas|bayer|john deere|disney|walt disney|mercado livre|mercadolibre|locaweb|ebanx|zenvia|kyndryl|fiserv|sovos|avalara|talkdesk|trustly|belvo|pismo|dock|neon|will bank|amil|sonda|avanade|keyrus|coforge|softserve|luxoft|capgemini|thoughtworks|hashicorp|twilio|okta|mongodb|elastic|confluent|hashicorp)\b/i.test(
      n
    )
  ) {
    return { kind: "employer", reason: "known-employer" };
  }

  if (AGENCY_RE.test(n)) return { kind: "agency", reason: "staffing" };
  return { kind: "employer", reason: "default" };
}

export function normalizeCompanyName(raw) {
  let n = String(raw || "").trim();
  // "Halian, CompanyHalian" → Halian
  const m = n.match(/^(.+?),\s*Company/i);
  if (m) n = m[1].trim();
  n = n.replace(/\s+/g, " ").trim();
  return n;
}
