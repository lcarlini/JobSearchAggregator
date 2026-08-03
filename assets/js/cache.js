/** In-memory + IndexedDB cache for search results / raw source payloads. */

const DB_NAME = "jsa-cache";
const STORE = "entries";
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 45 * 60 * 1000;

const memory = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function isFresh(entry, ttlMs) {
  if (!entry) return false;
  return Date.now() - entry.savedAt < ttlMs;
}

export async function cacheGet(key, ttlMs = DEFAULT_TTL_MS) {
  const mem = memory.get(key);
  if (isFresh(mem, ttlMs)) return mem.value;

  try {
    const disk = await idbGet(key);
    if (isFresh(disk, ttlMs)) {
      memory.set(key, disk);
      return disk.value;
    }
  } catch {
    /* ignore idb errors */
  }
  return null;
}

export async function cacheSet(key, value) {
  const entry = { savedAt: Date.now(), value };
  memory.set(key, entry);
  try {
    await idbSet(key, entry);
  } catch {
    /* ignore */
  }
  return value;
}

export function cacheClearMemory() {
  memory.clear();
}

export { DEFAULT_TTL_MS };
