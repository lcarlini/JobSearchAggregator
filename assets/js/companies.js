/** Load and filter the Empresas catalog (bookmark + curated). */

const REGION_ORDER = [
  "featured",
  "brazil",
  "worldwide",
  "us-br",
  "eu-br",
  "au-br",
  "latam",
  "bookmark",
];

let cache = null;

export async function loadEmpresas() {
  if (cache) return cache;
  const res = await fetch("./data/empresas.json", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`empresas.json HTTP ${res.status}`);
  cache = await res.json();
  return cache;
}

/**
 * @param {object[]} companies
 * @param {{ q?: string, region?: string, type?: string }} opts
 */
export function filterCompanies(companies, { q = "", region = "any", type = "any" } = {}) {
  const needle = q.trim().toLowerCase();
  return companies.filter((c) => {
    if (region !== "any") {
      if (region === "featured") {
        if (!c.featured) return false;
      } else if (region === "bookmark") {
        if (!String(c.source || "").includes("bookmark") && c.region !== "bookmark") {
          return false;
        }
      } else if (c.region !== region) {
        return false;
      }
    }
    if (type !== "any" && c.type !== type) return false;
    if (!needle) return true;
    const blob = `${c.name} ${c.host || ""} ${c.url} ${c.region || ""} ${c.note || ""}`.toLowerCase();
    return blob.includes(needle);
  });
}

export function groupCompanies(companies) {
  const featured = companies
    .filter((c) => c.featured)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const groups = new Map();
  if (featured.length) groups.set("featured", featured);

  for (const c of companies) {
    if (c.featured) continue; // already in featured
    const key = c.region || "bookmark";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const keys = [
    ...REGION_ORDER.filter((k) => groups.has(k)),
    ...[...groups.keys()].filter((k) => !REGION_ORDER.includes(k)).sort(),
  ];
  return keys.map((id) => ({
    id,
    companies:
      id === "featured"
        ? groups.get(id)
        : groups.get(id).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export { REGION_ORDER };
