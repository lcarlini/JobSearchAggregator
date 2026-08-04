/** Shared HTTP + validation helpers for source health checks. */
import fs from "node:fs";
import path from "node:path";
import { ROOT, jobShapeOk } from "./source-catalog.mjs";

const UA =
  "JobSearchAggregator/1.0 health-check (+https://github.com/lcarlini/JobSearchAggregator)";

export async function fetchText(url, { timeoutMs = 15000, method = "GET" } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json, application/rss+xml, application/xml, text/html, */*",
        "User-Agent": UA,
      },
    });
    const text = method === "HEAD" ? "" : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      text,
      finalUrl: res.url,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      text: "",
      error: e.name === "AbortError" ? "timeout" : e.message,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function checkJsonSource(src) {
  const hit = await fetchText(src.url, { timeoutMs: src.timeoutMs || 20000 });
  if (!hit.ok) {
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "json",
      ok: false,
      status: hit.status,
      ms: hit.ms,
      error: hit.error || `HTTP ${hit.status}`,
      count: 0,
    };
  }
  let data;
  try {
    data = JSON.parse(hit.text);
  } catch {
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "json",
      ok: false,
      status: hit.status,
      ms: hit.ms,
      error: "invalid JSON",
      count: 0,
    };
  }
  const items = typeof src.pick === "function" ? src.pick(data) : [];
  const min = src.minItems ?? 1;
  const ok = Array.isArray(items) && items.length >= min;
  return {
    id: src.id,
    critical: !!src.critical,
    kind: "json",
    ok,
    status: hit.status,
    ms: hit.ms,
    count: Array.isArray(items) ? items.length : 0,
    error: ok ? null : `expected ≥${min} items, got ${Array.isArray(items) ? items.length : 0}`,
  };
}

export async function checkRssSource(src) {
  const hit = await fetchText(src.url, { timeoutMs: 20000 });
  if (!hit.ok) {
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "rss",
      ok: false,
      status: hit.status,
      ms: hit.ms,
      error: hit.error || `HTTP ${hit.status}`,
      count: 0,
    };
  }
  const items = (hit.text.match(/<item[\s>]/gi) || []).length;
  const min = src.minItems ?? 1;
  const ok = items >= min;
  return {
    id: src.id,
    critical: !!src.critical,
    kind: "rss",
    ok,
    status: hit.status,
    ms: hit.ms,
    count: items,
    error: ok ? null : `expected ≥${min} <item>, got ${items}`,
  };
}

export async function checkReachable(src) {
  // Prefer HEAD; some boards reject HEAD → fallback GET
  let hit = await fetchText(src.url, { method: "HEAD", timeoutMs: 12000 });
  if (!hit.ok && (hit.status === 0 || hit.status === 405 || hit.status === 403)) {
    hit = await fetchText(src.url, { method: "GET", timeoutMs: 15000 });
  }
  // Many job boards return 403 to bots but are "online" — treat 2xx/3xx/401/403 as reachable
  const reachable =
    hit.ok ||
    [401, 403, 429].includes(hit.status) ||
    (hit.status >= 200 && hit.status < 400);
  return {
    id: src.id,
    critical: !!src.critical,
    kind: "http",
    ok: reachable,
    status: hit.status,
    ms: hit.ms,
    error: reachable ? null : hit.error || `HTTP ${hit.status}`,
    count: reachable ? 1 : 0,
  };
}

export function checkStaticCache(src) {
  const full = path.join(ROOT, src.path);
  if (!fs.existsSync(full)) {
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "static",
      ok: false,
      status: 0,
      ms: 0,
      error: "file missing",
      count: 0,
      path: src.path,
    };
  }
  try {
    const data = JSON.parse(fs.readFileSync(full, "utf8"));
    const items = typeof src.pick === "function" ? src.pick(data) : [];
    const min = src.minJobs ?? 1;
    const ok = Array.isArray(items) && items.length >= min;
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "static",
      ok,
      status: 200,
      ms: 0,
      count: Array.isArray(items) ? items.length : 0,
      error: ok ? null : `expected ≥${min} rows, got ${Array.isArray(items) ? items.length : 0}`,
      path: src.path,
      generatedAt: data.generatedAt || null,
    };
  } catch (e) {
    return {
      id: src.id,
      critical: !!src.critical,
      kind: "static",
      ok: false,
      status: 0,
      ms: 0,
      error: e.message,
      count: 0,
      path: src.path,
    };
  }
}

export async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export function summarize(results) {
  const criticalFail = results.filter((r) => r.critical && !r.ok);
  const softFail = results.filter((r) => !r.critical && !r.ok);
  const ok = results.filter((r) => r.ok);
  return {
    total: results.length,
    ok: ok.length,
    failed: results.length - ok.length,
    criticalFailed: criticalFail.length,
    softFailed: softFail.length,
    criticalFailIds: criticalFail.map((r) => r.id),
    softFailIds: softFail.map((r) => r.id),
  };
}

export { jobShapeOk };
