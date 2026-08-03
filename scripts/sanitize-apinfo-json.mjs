#!/usr/bin/env node
/** Re-sanitize data/apinfo-jobs.json titles/descriptions before display. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeText, stripHtml } from "../assets/js/normalize.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = path.join(root, "data", "apinfo-jobs.json");
const j = JSON.parse(fs.readFileSync(p, "utf8"));

let n = 0;
for (const job of j.jobs || []) {
  const before = JSON.stringify(job);
  job.title = sanitizeText(job.title, { title: true });
  job.company = sanitizeText(job.company);
  job.location = sanitizeText(job.location);
  job.description = stripHtml(job.description);
  if (JSON.stringify(job) !== before) n++;
}

j.generatedAt = j.generatedAt || new Date().toISOString();
fs.writeFileSync(p, JSON.stringify(j, null, 2));
console.log(`Sanitized ${n}/${j.jobs.length} ApInfo jobs`);
const sample = j.jobs.find((x) => /85199|Automa|RDC/i.test(x.id + x.title + x.company));
if (sample) console.log("sample:", sample.title, "|", sample.location);
