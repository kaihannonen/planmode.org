import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(
  path.resolve(process.cwd(), "..", ".github", "workflows", "publish-cli.yml"),
  "utf-8",
);

describe("CLI publish workflow", () => {
  it("routes prerelease versions to the next dist-tag", () => {
    expect(workflow).toContain("--tag next");
    expect(workflow).toContain('"$VERSION" == *-*');
  });

  it("routes stable versions to the latest dist-tag explicitly", () => {
    expect(workflow).toContain("--tag latest");
  });

  it("refuses to publish a release whose tag does not match package.json", () => {
    expect(workflow).toContain("github.event.release.tag_name");
    expect(workflow).toContain("v$VERSION");
    expect(workflow).toContain("does not match package version");
  });

  it("runs typecheck, tests, and a build before publishing", () => {
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run build");
  });
});
