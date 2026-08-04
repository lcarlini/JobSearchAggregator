import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadInterests,
  saveInterests,
  hasInterest,
  toggleInterest,
  addInterest,
  clearInterests,
} from "../assets/js/interests.js";

const store = new Map();

describe("interests list", () => {
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("adds and removes a job by url", () => {
    const job = {
      id: "a1",
      url: "https://example.com/job/1",
      title: "Senior .NET",
      company: "Acme",
      source: "remoteok",
      description: "Remote LATAM",
    };
    let list = loadInterests();
    assert.equal(list.length, 0);
    const added = toggleInterest(list, job);
    assert.equal(added.added, true);
    assert.equal(added.list.length, 1);
    assert.ok(hasInterest(added.list, job));
    const removed = toggleInterest(added.list, job);
    assert.equal(removed.added, false);
    assert.equal(removed.list.length, 0);
  });

  it("persists across load", () => {
    saveInterests([
      {
        url: "https://example.com/x",
        title: "Dev",
        company: "X",
        source: "ats",
      },
    ]);
    const list = loadInterests();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, "Dev");
  });

  it("migrates legacy jsa-saved urls", () => {
    localStorage.setItem("jsa-saved", JSON.stringify(["https://example.com/legacy"]));
    const list = loadInterests();
    assert.equal(list.length, 1);
    assert.equal(list[0].url, "https://example.com/legacy");
  });

  it("clears interests", () => {
    saveInterests([{ url: "https://example.com/y", title: "Y" }]);
    const list = clearInterests();
    assert.equal(list.length, 0);
    assert.equal(loadInterests().length, 0);
  });

  it("addInterest never duplicates the same url", () => {
    const job = {
      url: "https://example.com/job/dup",
      title: "Backend",
      company: "Acme",
      source: "apinfo",
    };
    const first = addInterest([], job);
    assert.equal(first.added, true);
    assert.equal(first.already, false);
    assert.equal(first.list.length, 1);
    const second = addInterest(first.list, { ...job, title: "Backend again" });
    assert.equal(second.added, false);
    assert.equal(second.already, true);
    assert.equal(second.list.length, 1);
    assert.equal(second.list[0].title, "Backend");
  });
});
