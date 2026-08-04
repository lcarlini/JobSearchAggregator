#!/usr/bin/env node
/**
 * Fetch public RSS job boards into static JSON (CORS-blocked in the browser).
 * Currently: We Work Remotely (programming / devops / design).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (compatible; JobSearchAggregator/1.0; +https://github.com/lcarlini/JobSearchAggregator)";

const FEEDS = [
  {
    source: "weworkremotely",
    category: "programming",
    url: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  },
  {
    source: "weworkremotely",
    category: "devops",
    url: "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
  },
  {
    source: "weworkremotely",
    category: "design",
    url: "https://weworkremotely.com/categories/remote-design-jobs.rss",
  },
  {
    source: "weworkremotely",
    category: "product",
    url: "https://weworkremotely.com/categories/remote-product-jobs.rss",
  },
  {
    source: "weworkremotely",
    category: "full-stack",
    url: "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  },
  {
    source: "weworkremotely",
    category: "management",
    url: "https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss",
  },
];

function decodeXml(s = "") {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html = "") {
  return decodeXml(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? decodeXml(m[1]).trim() : "";
}

function parseItems(xml) {
  const items = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) items.push(m[1]);
  return items;
}

function parseWwrTitle(title) {
  // "Company: Role" is the usual WWR pattern
  const idx = title.indexOf(":");
  if (idx > 0 && idx < 80) {
    return {
      company: title.slice(0, idx).trim(),
      title: title.slice(idx + 1).trim(),
    };
  }
  return { company: "Unknown", title };
}

function normalizeWwrItem(block, category) {
  const rawTitle = tag(block, "title");
  if (!rawTitle) return null;
  const { company, title } = parseWwrTitle(rawTitle);
  const link =
    tag(block, "link") ||
    (block.match(/<guid[^>]*>([^<]+)<\/guid>/i)?.[1] || "").trim();
  if (!link) return null;
  const region = tag(block, "region") || "Remote";
  const cat = tag(block, "category") || category;
  const description = stripHtml(tag(block, "description")).slice(0, 800);
  const pubDate = tag(block, "pubDate") || null;
  const idMatch = link.match(/\/(\d+)(?:-|\/|$)/);
  return {
    id: `weworkremotely:${idMatch?.[1] || link}`,
    source: "weworkremotely",
    title,
    company,
    url: link,
    description,
    location: region,
    tags: [cat, category].filter(Boolean),
    postedAt: pubDate,
    category,
  };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml, */*", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

const jobs = [];
const seen = new Set();

for (const feed of FEEDS) {
  try {
    const xml = await fetchText(feed.url);
    const items = parseItems(xml);
    let added = 0;
    for (const block of items) {
      const job = normalizeWwrItem(block, feed.category);
      if (!job || seen.has(job.id)) continue;
      seen.add(job.id);
      jobs.push(job);
      added++;
    }
    console.log(`WWR ${feed.category} → ${items.length} items, +${added} unique`);
  } catch (e) {
    console.warn(`WWR ${feed.category} failed:`, e.message);
  }
  await new Promise((r) => setTimeout(r, 300));
}

const out = {
  generatedAt: new Date().toISOString(),
  count: jobs.length,
  jobs,
};

const outPath = path.join(root, "data", "weworkremotely-jobs.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${jobs.length} → data/weworkremotely-jobs.json`);
