/**
 * Parse known public ATS / Workday career URLs into board descriptors.
 */
import { parseWorkdayUrl } from "./workday.mjs";

export function parseAtsUrl(raw) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  const wd = parseWorkdayUrl(raw);
  if (wd) return { ats: "workday", board: wd };

  // boards.greenhouse.io/{slug} or job-boards.greenhouse.io/{slug}
  let m = host.match(/^(?:boards|job-boards)\.greenhouse\.io$/i);
  if (m) {
    const slug = path.split("/").filter(Boolean)[0];
    if (slug) return { ats: "greenhouse", slug };
  }

  // jobs.lever.co/{slug}
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const slug = path.split("/").filter(Boolean)[0];
    if (slug) return { ats: "lever", slug };
  }

  // jobs.ashbyhq.com/{slug}
  if (host === "jobs.ashbyhq.com") {
    const slug = path.split("/").filter(Boolean)[0];
    if (slug) return { ats: "ashby", slug };
  }

  // apply.workable.com/{slug}
  if (host === "apply.workable.com") {
    const slug = path.split("/").filter(Boolean)[0];
    if (slug && slug !== "api") return { ats: "workable", slug };
  }

  // jobs.smartrecruiters.com/{Company}
  if (host === "jobs.smartrecruiters.com") {
    const slug = path.split("/").filter(Boolean)[0];
    if (slug) return { ats: "smartrecruiters", slug };
  }

  // {slug}.recruitee.com
  m = host.match(/^([a-z0-9-]+)\.recruitee\.com$/i);
  if (m) return { ats: "recruitee", slug: m[1] };

  // {slug}.breezy.hr
  m = host.match(/^([a-z0-9-]+)\.breezy\.hr$/i);
  if (m) return { ats: "breezy", slug: m[1] };

  // {slug}.bamboohr.com
  m = host.match(/^([a-z0-9-]+)\.bamboohr\.com$/i);
  if (m) return { ats: "bamboohr", slug: m[1] };

  // {slug}.jobs.personio.com
  m = host.match(/^([a-z0-9-]+)\.jobs\.personio\.(com|de)$/i);
  if (m) return { ats: "personio", slug: m[1] };

  return null;
}

/** Extract ATS/Workday career links from HTML (lightweight). */
export function extractAtsLinksFromHtml(html, baseUrl) {
  const found = [];
  const seen = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    let href = m[1];
    try {
      href = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    const parsed = parseAtsUrl(href);
    if (!parsed) continue;
    const key =
      parsed.ats === "workday"
        ? `workday:${parsed.board.id}`
        : `${parsed.ats}:${parsed.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ ...parsed, url: href });
  }
  return found;
}
