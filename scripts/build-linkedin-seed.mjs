#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyCompany,
  normalizeCompanyName,
  slugifyCompany,
} from "./lib/company-classify.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawPath = path.join(root, "data", "linkedin-companies-raw.txt");
const outPath = path.join(root, "data", "linkedin-companies-seed.json");

const raw = fs
  .readFileSync(rawPath, "utf8")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("#") && !/^\d[\d,.]*\s*followers?/i.test(s));

const companies = [];
const seen = new Set();
for (const line of raw) {
  const name = normalizeCompanyName(line);
  const key = name.toLowerCase();
  if (!name || seen.has(key)) continue;
  seen.add(key);
  const { kind, reason } = classifyCompany(name);
  companies.push({ name, slug: slugifyCompany(name), kind, reason });
}

const stats = {
  total: companies.length,
  employer: companies.filter((c) => c.kind === "employer").length,
  board: companies.filter((c) => c.kind === "board").length,
  agency: companies.filter((c) => c.kind === "agency").length,
  skip: companies.filter((c) => c.kind === "skip").length,
};

const out = {
  generatedAt: new Date().toISOString(),
  source: "linkedin-following-export-paste",
  stats,
  companies,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log("Wrote", outPath, stats);
