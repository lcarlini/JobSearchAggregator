/** Shared job normalization helpers (browser + Node). */

const MOJIBAKE_MAP = [
  [/Ã¡/g, "á"],
  [/Ã©/g, "é"],
  [/Ã­/g, "í"],
  [/Ã³/g, "ó"],
  [/Ãº/g, "ú"],
  [/Ã£/g, "ã"],
  [/Ãµ/g, "õ"],
  [/Ã§/g, "ç"],
  [/Ã¢/g, "â"],
  [/Ãª/g, "ê"],
  [/Ã´/g, "ô"],
  [/Ã /g, "à"],
  [/Ã/g, "Á"],
  [/Ã‰/g, "É"],
  [/Ã/g, "Í"],
  [/Ã“/g, "Ó"],
  [/Ãš/g, "Ú"],
  [/Ãƒ/g, "Ã"],
  [/Ã•/g, "Õ"],
  [/Ã‡/g, "Ç"],
  [/Â /g, " "],
  [/Â(?=[\s,.!?;:])/g, ""],
];

/**
 * Fix UTF-8 read as Latin-1 (Ã£ → ã) and common ApInfo glue.
 * @param {string} input
 * @param {{ title?: boolean }} [opts] — title mode also splits CamelCase / role glue
 */
export function sanitizeText(input = "", opts = {}) {
  let s = String(input ?? "");
  if (!s) return "";

  // Mojibake repair (may need 2 passes)
  for (let i = 0; i < 2; i++) {
    let next = s;
    for (const [re, ch] of MOJIBAKE_MAP) next = next.replace(re, ch);
    if (next === s) break;
    s = next;
  }

  // Drop leftover replacement chars (unrecoverable)
  s = s.replace(/\uFFFD+/g, "");

  // Collapse letter-spaced runs: "S ê n i o r" → "Sênior"
  s = s.replace(/(?<!\S)(?:[\p{L}\p{N}.#+-]\s+){4,}[\p{L}\p{N}.#+-](?!\S)/gu, (run) =>
    run.replace(/\s+/g, "")
  );

  if (opts.title) {
    // CamelCase / glued role titles from ApInfo highlight collapse
    s = s
      .replace(/([a-zà-úç]{2,})([A-ZÁ-ÚÇ])/g, "$1 $2")
      .replace(
        /\b(Engenheiro|Analista|Desenvolvedor|Administrador|Arquiteto|Gerente|T[eé]cnico|Coordenador|Especialista|Programador|Consultor)(a?)(de|da|do)\b/gi,
        "$1$2 $3"
      )
      .replace(/(ção|são|agem|dade|ente|ista|ador|edora?)(com|para|de|em|e)\b/gi, "$1 $2")
      .replace(/\(\s*([a-zA-Z])\s*\)/g, "($1)");
  }

  return s.replace(/\s+/g, " ").trim();
}

export function stripHtml(html = "") {
  return sanitizeText(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  );
}

export function toEpoch(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }
  const n = Number(value);
  if (!Number.isNaN(n) && String(value).trim() !== "") {
    return n < 1e12 ? n * 1000 : n;
  }
  const d = Date.parse(value);
  return Number.isNaN(d) ? null : d;
}

export function detectJobType(text = "") {
  const t = text.toLowerCase();
  if (/\b(freelance|freelancer|contractor|contract|consulting|hourly|gig|temporary|temp\b)\b/.test(t)) {
    return "freelance";
  }
  if (/\b(intern|internship|estágio|estagio)\b/.test(t)) return "internship";
  if (/\b(part[-\s]?time|meio período|meio periodo)\b/.test(t)) return "part-time";
  if (/\b(full[-\s]?time|clt|permanent|efetiv)\b/.test(t)) return "full-time";
  return "unknown";
}

export function detectWorkplace(text = "") {
  const t = text.toLowerCase();
  if (/\b(hybrid|híbrido|hibrido)\b/.test(t)) return "hybrid";
  if (/\b(on[-\s]?site|onsite|presencial|in[-\s]?office|office[-\s]?based)\b/.test(t)) {
    return "onsite";
  }
  if (
    /\b(remote|remoto|work from home|wfh|distributed|work from anywhere|100%\s*remote|fully remote)\b/.test(
      t
    )
  ) {
    return "remote";
  }
  return "unknown";
}

export function detectEngagement(text = "") {
  const t = text.toLowerCase();
  if (/\b(eor|employer of record|deel|remote\.com payroll)\b/.test(t)) return "eor";
  if (/\b(clt|carteira assinada)\b/.test(t)) return "clt";
  if (/\b(pj|pessoa jurídica|mei\b|cnpj)\b/.test(t)) return "pj";
  if (/\b(freelance|freelancer)\b/.test(t)) return "freelance";
  if (/\b(contractor|contract|b2b|consulting)\b/.test(t)) return "contractor";
  if (/\b(employee|w2|permanent|full[-\s]?time)\b/.test(t)) return "employee";
  return "unknown";
}

export function detectRemotePolicy(text = "") {
  const t = text.toLowerCase();
  if (
    /\b(work from anywhere|anywhere in the world|worldwide|global remote|remote[- ]?worldwide|no location restriction|candidates? (from )?anywhere)\b/.test(
      t
    )
  ) {
    return "anywhere";
  }
  if (/\b(latam only|latin america only|only latam|remote[- ]?latam)\b/.test(t)) return "latam-only";
  if (/\b(emea only|europe only|eu only|eu\/uk only|remote[- ]?europe only)\b/.test(t)) return "emea-only";
  if (
    /\b(us only|united states only|must be (located|based) in the (us|usa|united states)|remote us only|uk only|canada only|australia only|germany only|portugal only|uae only|remote within (the )?country)\b/.test(
      t
    )
  ) {
    return "country-restricted";
  }
  if (/\b(brazil ok|brasil ok|candidates? from brazil|hire from brazil|aceita .*brasil)\b/.test(t)) {
    return "brazil-ok";
  }
  if (/\b(async|asynchronous|no timezone|timezone flexible)\b/.test(t)) return "async";
  if (/\b(overlap|timezone|time zone|core hours|working hours)\b/.test(t)) return "timezone-bound";
  return "unknown";
}

/**
 * Classifies remote openness:
 * - worldwide: hire from anywhere / global remote
 * - region: LATAM-only, EMEA-only, APAC-only, etc.
 * - country: remote but only within one country
 * - unknown: remote without clear geographic bound
 */
export function detectRemoteScope(text = "", location = "", extras = {}) {
  const { workplace, remotePolicy, geo } = extras;
  const t = `${text} ${location}`.toLowerCase();
  const loc = String(location || "").toLowerCase();

  if (
    remotePolicy === "anywhere" ||
    geo?.worldwide ||
    /\b(work from anywhere|anywhere in the world|worldwide|global remote|remote[- ]?worldwide|no location restriction|candidates? (from )?anywhere|hire (from )?anywhere)\b/.test(
      t
    )
  ) {
    return "worldwide";
  }

  if (
    remotePolicy === "latam-only" ||
    remotePolicy === "emea-only" ||
    /\b(latam only|latin america only|emea only|europe only|eu only|apac only|remote[- ]?(latam|emea|europe|eu|apac)( only)?)\b/.test(
      t
    )
  ) {
    return "region";
  }

  if (
    remotePolicy === "country-restricted" ||
    /\b(remote (us|usa|uk|canada|australia|brazil|brasil|germany|portugal|netherlands|ireland|spain|france|uae|nz|new zealand) only|must be (based|located) in|only (candidates|applicants) (in|from)|us[- ]based remote|uk[- ]based remote|canada[- ]based remote|remote within|remoto (apenas|somente) (no|em))\b/.test(
      t
    )
  ) {
    return "country";
  }

  // Location like "Remote - Germany" / "Toronto, Canada (Remote)" without worldwide
  if (
    (workplace === "remote" || /\bremote|remoto\b/.test(loc)) &&
    loc &&
    !/^(remote|remoto)$/i.test(loc.trim()) &&
    !/\b(worldwide|anywhere|global)\b/.test(loc)
  ) {
    const countryLoc =
      /\b(brazil|brasil|united states|usa|u\.s\.|united kingdom|\buk\b|canada|australia|new zealand|uae|dubai|germany|portugal|netherlands|ireland|spain|france|lisbon|lisboa|berlin|amsterdam|dublin|madrid|paris|toronto|vancouver|auckland|sydney|melbourne|london|new york|são paulo|sao paulo)\b/i.test(
        loc
      );
    if (countryLoc) return "country";
  }

  return "unknown";
}

export function detectSponsorship(text = "") {
  const t = text.toLowerCase();
  if (/\b(no sponsorship|cannot sponsor|not able to sponsor|sponsorship not available)\b/.test(t)) {
    return "no";
  }
  if (/\b(visa sponsorship|will sponsor|h1b|sponsorship available|open to sponsorship)\b/.test(t)) {
    return "yes";
  }
  return "unknown";
}

export function detectTimezone(text = "") {
  const t = text.toLowerCase();
  const zones = [];
  if (/\b(brt|brasilia|brasília|utc\s*-?\s*3|gmt-3|america\/sao_paulo)\b/.test(t)) zones.push("BRT");
  if (/\b(est|edt|eastern|utc\s*-?\s*5|utc\s*-?\s*4|america\/new_york)\b/.test(t)) zones.push("EST");
  if (/\b(pst|pdt|pacific|utc\s*-?\s*8|utc\s*-?\s*7|america\/los_angeles)\b/.test(t)) zones.push("PST");
  if (/\b(cet|cest|central european|utc\s*\+?\s*1|utc\s*\+?\s*2|europe\/)\b/.test(t)) zones.push("CET");
  if (/\b(aest|aedt|australian eastern|sydney time|utc\s*\+?\s*10|utc\s*\+?\s*11)\b/.test(t)) {
    zones.push("AEST");
  }
  if (/\b(nzst|nzdt|new zealand (time|standard)|auckland time|utc\s*\+?\s*12|utc\s*\+?\s*13)\b/.test(t)) {
    zones.push("NZST");
  }
  if (/\b(gst|gulf standard|dubai time|utc\s*\+?\s*4|asia\/dubai)\b/.test(t)) zones.push("GST");
  if (/\b(gmt|bst|london time|uk time)\b/.test(t)) zones.push("GMT");
  return zones;
}

export function detectEnglishLevel(text = "") {
  const t = text.toLowerCase();
  if (/\b(native english|english native|bilingual)\b/.test(t)) return "native";
  if (/\b(fluent english|english fluent|fluente|c1|c2|advanced english)\b/.test(t)) return "fluent";
  if (/\b(professional english|working proficiency|b2|upper[- ]intermediate)\b/.test(t)) {
    return "professional";
  }
  if (/\b(english required|must speak english|inglês (avançado|fluente|intermediário|intermediario))\b/.test(t)) {
    return "required";
  }
  return "unknown";
}

export function detectEmployerType(text = "") {
  const t = text.toLowerCase();
  if (/\b(staffing|recruiting agency|recruitment agency|talent agency|headhunt|agency)\b/.test(t)) {
    return "agency";
  }
  return "employer";
}

export function detectCompanyStage(text = "") {
  const t = text.toLowerCase();
  if (/\b(series [a-d]|seed|pre-seed|startup|early stage)\b/.test(t)) return "startup";
  if (/\b(scale[- ]?up|growth stage|series [c-e])\b/.test(t)) return "scaleup";
  if (/\b(enterprise|fortune 500|public company|multinational)\b/.test(t)) return "enterprise";
  return "unknown";
}

export function detectCompanySize(text = "") {
  const t = text.toLowerCase();
  if (/\b(1\s*[-–]\s*10|0\s*[-–]\s*10|small team|boutique)\b/.test(t)) return "1-10";
  if (/\b(11\s*[-–]\s*50|10\s*[-–]\s*50)\b/.test(t)) return "11-50";
  if (/\b(51\s*[-–]\s*200|50\s*[-–]\s*200)\b/.test(t)) return "51-200";
  if (/\b(201\s*[-–]\s*1000|200\s*[-–]\s*1000|mid[- ]size)\b/.test(t)) return "201-1000";
  if (/\b(1000\+|1001|enterprise|large company)\b/.test(t)) return "1000+";
  return "unknown";
}

/** Parse rough salary into annualized USD-ish number when possible; keep raw currency. */
export function parseSalary(salaryText = "", blob = "") {
  const text = `${salaryText} ${blob}`;
  if (!text.trim()) return { min: null, max: null, currency: null, period: null, raw: salaryText || null };

  let currency = null;
  if (/R\$|BRL|reais/i.test(text)) currency = "BRL";
  else if (/€|EUR\b/i.test(text)) currency = "EUR";
  else if (/£|GBP\b/i.test(text)) currency = "GBP";
  else if (/A\$|AUD\b/i.test(text)) currency = "AUD";
  else if (/\$|USD\b/i.test(text)) currency = "USD";

  let period = "year";
  if (/\b(hour|hr|hora|hourly)\b/i.test(text)) period = "hour";
  else if (/\b(month|mês|mes|monthly|\/mo)\b/i.test(text)) period = "month";
  else if (/\b(year|anual|annually|\/yr|per year)\b/i.test(text)) period = "year";

  const nums = [...text.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d+)?/g)].map((m) => {
    const raw = m[1].replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".");
    return Number(raw);
  }).filter((n) => n > 0);

  let min = null;
  let max = null;
  if (nums.length >= 2) {
    min = Math.min(nums[0], nums[1]);
    max = Math.max(nums[0], nums[1]);
  } else if (nums.length === 1) {
    min = nums[0];
    max = nums[0];
  }

  // Heuristic: small numbers with year period might be k
  if (min != null && min < 1000 && period === "year" && /k\b/i.test(text)) {
    min *= 1000;
    if (max != null) max *= 1000;
  }

  return { min, max, currency, period, raw: salaryText || null };
}

export function detectLanguage(text = "") {
  const t = text.toLowerCase();
  const ptHits =
    (t.match(/\b(vaga|desenvolvedor|remoto|experiência|experiencia|requisitos|benefício|beneficio|salário|salario|português|portugues|brasil|são paulo|sao paulo)\b/g) || [])
      .length;
  const enHits =
    (t.match(/\b(job|developer|remote|experience|requirements|benefits|salary|english|worldwide)\b/g) || [])
      .length;
  const esHits =
    (t.match(/\b(empleo|desarrollador|remoto|requisitos|salario|español|espanol|méxico|mexico|argentina)\b/g) || [])
      .length;
  if (ptHits >= 2 && ptHits >= enHits && ptHits >= esHits) return "pt";
  if (esHits >= 2 && esHits > enHits && esHits > ptHits) return "es";
  if (enHits >= 2 && enHits > ptHits) return "en";
  if (ptHits > enHits) return "pt";
  if (enHits > ptHits) return "en";
  return "unknown";
}

const LATAM_RE =
  /\b(latam|latin america|américa latina|america latina|brazil|brasil|argentina|colombia|colômbia|mexico|méxico|chile|peru|uruguay|paraguay|remote[- ]?latam|anywhere in latam|candidates? from brazil|brazilian|aceita (candidato )?do brasil|hire from brazil)\b/i;

// Explicit global eligibility — do NOT treat "fully remote" as worldwide
const WORLDWIDE_RE =
  /\b(worldwide|work from anywhere|anywhere in the world|remote[- ]?global|global remote|remote worldwide|candidates? (from )?anywhere|no location restriction)\b/i;

const EU_COUNTRY_RE =
  /\b(europe|eu only|emea|germany|berlin|munich|netherlands|amsterdam|portugal|lisbon|lisboa|porto|spain|madrid|barcelona|ireland|dublin|france|paris|belgium|brussels|sweden|stockholm|poland|warsaw|italy|milan|rome|austria|vienna|switzerland|zurich|denmark|copenhagen|finland|helsinki|norway|oslo|remote europe)\b/i;

export function detectGeoFlags(text = "", location = "") {
  const blob = `${text} ${location}`;
  const portugal = /\b(portugal|lisbon|lisboa|porto|remote portugal)\b/i.test(blob);
  const germany = /\b(germany|berlin|munich|hamburg|remote germany|deutschland)\b/i.test(blob);
  const netherlands = /\b(netherlands|amsterdam|rotterdam|remote netherlands|holland)\b/i.test(blob);
  const ireland = /\b(ireland|dublin|remote ireland)\b/i.test(blob);
  const spain = /\b(spain|madrid|barcelona|valencia|remote spain|españa|espana)\b/i.test(blob);
  const france = /\b(france|paris|lyon|remote france)\b/i.test(blob);
  const canada = /\b(canada|toronto|vancouver|montreal|ottawa|remote canada)\b/i.test(blob);
  const newZealand = /\b(new zealand|auckland|wellington|christchurch|remote nz)\b/i.test(blob);
  const uae = /\b(uae|united arab emirates|dubai|abu dhabi|remote uae|middle east)\b/i.test(blob);
  const europe =
    EU_COUNTRY_RE.test(blob) || portugal || germany || netherlands || ireland || spain || france;
  return {
    latamFriendly: LATAM_RE.test(blob),
    worldwide: WORLDWIDE_RE.test(blob),
    brazil: /\b(brazil|brasil|são paulo|sao paulo|rio de janeiro|remoto brasil)\b/i.test(blob),
    uk: /\b(united kingdom|uk|london|england|manchester|remote uk)\b/i.test(blob),
    australia: /\b(australia|sydney|melbourne|brisbane|remote au)\b/i.test(blob),
    europe,
    us: /\b(united states|usa|u\.s\.|new york|san francisco|remote us)\b/i.test(blob),
    canada,
    newZealand,
    uae,
    portugal,
    germany,
    netherlands,
    ireland,
    spain,
    france,
  };
}

export function detectEasyApply(text = "", url = "") {
  const t = `${text} ${url}`.toLowerCase();
  return /\b(easy apply|candidatura simplificada|quick apply|one[- ]click apply)\b/.test(t);
}

export function detectTravel(text = "") {
  const t = text.toLowerCase();
  if (/\b(no travel|sem viagem|travel not required)\b/.test(t)) return "none";
  if (/\b(occasional travel|some travel|viagens eventuais|travel required)\b/.test(t)) return "occasional";
  return "unknown";
}

export function makeJob(partial) {
  // Validate/repair text before anything is shown in the UI
  const title = sanitizeText(partial.title || "Untitled", { title: true }) || "Untitled";
  const description = stripHtml(partial.description || "");
  const company = sanitizeText(partial.company || "Unknown") || "Unknown";
  const location = sanitizeText(partial.location || "");
  const tags = (partial.tags || []).map((t) => sanitizeText(String(t))).filter(Boolean);
  const blob = `${title} ${description} ${location} ${tags.join(" ")}`;
  const geo = detectGeoFlags(blob, location);
  const postedAt = toEpoch(partial.postedAt);
  const salaryInfo = parseSalary(partial.salary || "", blob);
  const workplace = partial.workplace || detectWorkplace(blob);
  const remotePolicy = partial.remotePolicy || detectRemotePolicy(blob);
  const remoteScope =
    partial.remoteScope ||
    detectRemoteScope(blob, location, { workplace, remotePolicy, geo });

  return {
    id: partial.id || `${partial.source}:${title}:${company}`.toLowerCase().replace(/\s+/g, "-"),
    source: partial.source,
    title,
    company,
    url: partial.url || "#",
    description,
    location,
    tags,
    salary: salaryInfo.raw || partial.salary || null,
    salaryInfo,
    jobType: partial.jobType || detectJobType(blob),
    workplace,
    engagement: partial.engagement || detectEngagement(blob),
    remotePolicy,
    remoteScope,
    sponsorship: partial.sponsorship || detectSponsorship(blob),
    timezones: partial.timezones || detectTimezone(blob),
    englishLevel: partial.englishLevel || detectEnglishLevel(blob),
    employerType: partial.employerType || detectEmployerType(`${company} ${blob}`),
    companyStage: partial.companyStage || detectCompanyStage(blob),
    companySize: partial.companySize || detectCompanySize(blob),
    easyApply: partial.easyApply ?? detectEasyApply(blob, partial.url || ""),
    travel: partial.travel || detectTravel(blob),
    language: partial.language || detectLanguage(blob),
    postedAt,
    geo,
    raw: partial.raw || null,
  };
}

function jobFingerprint(job) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `fp:${norm(job.title)}|${norm(job.company)}`;
}

/** Prefer international/ATS boards over local-only scrapes when fingerprints collide. */
function sourcePriority(source) {
  const s = String(source || "").toLowerCase();
  if (s === "static-ats" || s === "ashby") return 3;
  if (["remoteok", "remotive", "jobicy", "himalayas", "weworkremotely", "arbeitnow"].includes(s)) {
    return 2;
  }
  if (s === "apinfo") return 0;
  return 1;
}

export function dedupeJobs(jobs) {
  const keyToIdx = new Map();
  const out = [];
  for (const job of jobs) {
    const keys = [];
    if (job.id) keys.push(`id:${String(job.id).toLowerCase()}`);
    if (job.url && job.url !== "#") {
      const u = job.url.toLowerCase().split("#")[0];
      // Keep query when it identifies the listing (ApInfo codvaga, Greenhouse gh_jid…)
      keys.push(
        /[?&](codvaga|gh_jid)=/i.test(u) ? `url:${u}` : `url:${u.split("?")[0]}`
      );
    }
    // Cross-source collapse: same role at same company from ATS + boards
    keys.push(jobFingerprint(job));

    let existingIdx = -1;
    for (const k of keys) {
      if (keyToIdx.has(k)) {
        existingIdx = keyToIdx.get(k);
        break;
      }
    }
    if (existingIdx >= 0) {
      const prev = out[existingIdx];
      if (sourcePriority(job.source) > sourcePriority(prev.source)) {
        out[existingIdx] = job;
        for (const k of keys) keyToIdx.set(k, existingIdx);
      }
      continue;
    }
    const idx = out.length;
    out.push(job);
    for (const k of keys) keyToIdx.set(k, idx);
  }
  return out;
}

export function hashFilters(filters) {
  return JSON.stringify(filters, Object.keys(filters).sort());
}
