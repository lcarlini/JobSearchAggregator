/**
 * Parse public Workday career URLs → { id, host, tenant, site }.
 * Supports:
 *   https://csgi.wd5.myworkdayjobs.com/CSGCareers/...
 *   https://planet.wd3.myworkdayjobs.com/en-US/Planet
 *   https://wd1.myworkdaysite.com/recruiting/fmr/FidelityCareers/...
 */

export function parseWorkdayUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  // {tenant}.wdN.myworkdayjobs.com/{lang?}/{site}/...
  const m = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i);
  if (m) {
    const tenant = m[1];
    const site = pickSite(parts);
    if (!site) return null;
    return {
      id: `${tenant}/${site}`,
      host,
      tenant,
      site,
      url: `https://${host}/${site}`,
    };
  }

  // wdN.myworkdaysite.com/recruiting/{tenant}/{site}/...
  if (/^wd\d+\.myworkdaysite\.com$/i.test(host)) {
    const ri = parts.findIndex((p) => p.toLowerCase() === "recruiting");
    if (ri >= 0 && parts[ri + 1] && parts[ri + 2]) {
      const tenant = parts[ri + 1];
      const site = parts[ri + 2];
      return {
        id: `${tenant}/${site}`,
        host,
        tenant,
        site,
        url: `https://${host}/recruiting/${tenant}/${site}`,
      };
    }
  }

  return null;
}

function pickSite(parts) {
  const skip = new Set(["en-us", "en-gb", "pt-br", "es", "fr", "de", "job", "jobs"]);
  for (const p of parts) {
    const low = p.toLowerCase();
    if (skip.has(low)) continue;
    if (low.startsWith("job/") || /^[0-9a-f-]{20,}$/i.test(p)) continue;
    // site names are usually Pascal/camel tokens without dots
    if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(p)) return p;
  }
  return null;
}

export function workdayJobsUrl(board) {
  return `https://${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`;
}

export function workdayPublicJobUrl(board, externalPath) {
  const path = String(externalPath || "").startsWith("/")
    ? externalPath
    : `/${externalPath || ""}`;
  return `https://${board.host}/${board.site}${path}`;
}

export function normalizeWorkdayBoard(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    if (entry.includes("://")) return parseWorkdayUrl(entry);
    const [tenant, site] = entry.split("/");
    if (!tenant || !site) return null;
    return {
      id: `${tenant}/${site}`,
      host: `${tenant}.wd5.myworkdayjobs.com`,
      tenant,
      site,
      url: `https://${tenant}.wd5.myworkdayjobs.com/${site}`,
    };
  }
  if (entry.host && entry.tenant && entry.site) {
    return {
      id: entry.id || `${entry.tenant}/${entry.site}`,
      host: entry.host,
      tenant: entry.tenant,
      site: entry.site,
      url: entry.url || `https://${entry.host}/${entry.site}`,
    };
  }
  if (entry.url) return parseWorkdayUrl(entry.url);
  return null;
}
