import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  )) as Record<string, unknown>;
}

describe("release metadata", () => {
  it("keeps the manifest, package, and lockfile synchronized", () => {
    const manifest = readJson("../manifest.json");
    const packageJson = readJson("../package.json");
    const lock = readJson("../package-lock.json") as {
      version?: string;
      packages?: Record<string, { version?: string }>;
    };

    expect(packageJson.version).toBe(manifest.version);
    expect(lock.version).toBe(manifest.version);
    expect(lock.packages?.[""]?.version).toBe(manifest.version);
  });
});
