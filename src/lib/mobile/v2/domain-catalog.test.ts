// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mobileDomainCatalog, mobileDomainCatalogStatus, mobileDomainReadGaps, mobileSnapshotExcludedFields } from "./domain-catalog";

function websiteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return websiteFiles(path);
    return /\.tsx?$/.test(path) && !/\.test\.|desktop|[\\/]mobile[\\/]/i.test(path) ? [path] : [];
  });
}

describe("mobile domain inventory boundaries", () => {
  it("accounts for every directly queried website table without treating Storage buckets as tables", () => {
    const accounted = new Set<string>(mobileDomainCatalog.map(domain => domain.table));
    // Device push credentials have a dedicated registration flow, never an offline record export.
    accounted.add("push_subscriptions");
    const storageBuckets = new Set(["practice-files", "presentation-media"]);
    const missing = new Set<string>();
    for (const file of ["src/app", "src/components", "src/lib"].flatMap(directory => websiteFiles(resolve(directory)))) {
      for (const match of readFileSync(file, "utf8").matchAll(/\.from\(\s*["']([\w-]+)["']\s*\)/g)) {
        if (!accounted.has(match[1]) && !storageBuckets.has(match[1])) missing.add(match[1]);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("keeps credential-bearing tables out of the record catalog and keeps unresolved scope explicit", () => {
    const tables = new Set<string>(mobileDomainCatalog.map(domain => domain.table));
    for (const table of Object.keys(mobileSnapshotExcludedFields)) expect(tables.has(table)).toBe(false);
    expect(tables.has("worship_sync_receipts")).toBe(false);
    expect(tables.has("worship_sync_changes")).toBe(false);
    expect(mobileDomainCatalogStatus).toBe("design-only-incomplete");
    expect(mobileDomainReadGaps.some(gap => gap.domain === "all-domain-deltas")).toBe(true);
    expect(mobileDomainReadGaps.some(gap => gap.domain === "asset-bytes")).toBe(true);
  });

  it("ties the private conversation and draft domains to their inspected authorization sources", () => {
    const domains = new Map(mobileDomainCatalog.map(domain => [domain.table, domain]));
    expect(domains.get("messages")?.scope).toBe("channel");
    expect(domains.get("shared_edit_requests")?.scope).toBe("actor-or-reviewer");
    expect(domains.get("announcements")?.scope).toBe("targeted");
    expect(domains.get("wooly_support_requests")?.scope).toBe("actor-or-support");
    for (const domain of mobileDomainCatalog) {
      expect(readFileSync(resolve(domain.source), "utf8").length).toBeGreaterThan(0);
      expect(readFileSync(resolve(domain.policySource), "utf8")).toContain(domain.table);
      expect(new Set(domain.key).size).toBe(domain.key.length);
      for (const key of domain.key) expect(domain.fields).toContain(key);
    }
  });
});
