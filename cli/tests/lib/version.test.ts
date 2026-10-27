import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { readVersion } from "../../src/version.js";

describe("readVersion", () => {
  it("matches the package manifest", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(readVersion()).toBe(packageJson.version);
  });
});
