import type { PackageMetadata } from "../types/index.js";
import { fetchPackageMetadata } from "./registry.js";

interface VersionRange {
  operator: "exact" | "caret" | "tilde" | "gte" | "any";
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split(".").map(Number);
  return { major: parts[0]!, minor: parts[1]!, patch: parts[2]! };
}

function parseVersionRange(range: string): VersionRange {
  if (range === "*") {
    return { operator: "any", major: 0, minor: 0, patch: 0 };
  }
  if (range.startsWith("^")) {
    const { major, minor, patch } = parseSemver(range.slice(1));
    return { operator: "caret", major, minor, patch };
  }
  if (range.startsWith("~")) {
    const { major, minor, patch } = parseSemver(range.slice(1));
    return { operator: "tilde", major, minor, patch };
  }
  if (range.startsWith(">=")) {
    const { major, minor, patch } = parseSemver(range.slice(2));
    return { operator: "gte", major, minor, patch };
  }
  const { major, minor, patch } = parseSemver(range);
  return { operator: "exact", major, minor, patch };
}

function satisfies(version: string, range: VersionRange): boolean {
  const v = parseSemver(version);

  switch (range.operator) {
    case "any":
      return true;

    case "exact":
      return v.major === range.major && v.minor === range.minor && v.patch === range.patch;

    case "caret":
      // ^1.2.3 → >=1.2.3, <2.0.0
      if (v.major !== range.major) return false;
      if (v.minor > range.minor) return true;
      if (v.minor === range.minor) return v.patch >= range.patch;
      return false;

    case "tilde":
      // ~1.2.3 → >=1.2.3, <1.3.0
      if (v.major !== range.major) return false;
      if (v.minor !== range.minor) return false;
      return v.patch >= range.patch;

    case "gte":
      if (v.major > range.major) return true;
      if (v.major < range.major) return false;
      if (v.minor > range.minor) return true;
      if (v.minor < range.minor) return false;
      return v.patch >= range.patch;
  }
}

function compareVersions(a: string, b: string): number {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

export function parseDepString(dep: string): { name: string; range: string } {
  const atIndex = dep.lastIndexOf("@");
  if (atIndex > 0) {
    return {
      name: dep.slice(0, atIndex),
      range: dep.slice(atIndex + 1),
    };
  }
  return { name: dep, range: "*" };
}

export async function resolveVersion(
  packageName: string,
  versionRange?: string,
): Promise<{ version: string; metadata: PackageMetadata }> {
  const metadata = await fetchPackageMetadata(packageName);

  if (!versionRange || versionRange === "latest") {
    return { version: metadata.latest_version, metadata };
  }

  const range = parseVersionRange(versionRange);
  const matching = metadata.versions
    .filter((v) => satisfies(v, range))
    .sort(compareVersions);

  if (matching.length === 0) {
    throw new Error(
      `Version '${versionRange}' not found for '${packageName}'. Available: ${metadata.versions.join(", ")}`,
    );
  }

  const version = matching[matching.length - 1]!;
  return { version, metadata };
}

export function findHighestSatisfying(versions: string[], ranges: string[]): string | null {
  const parsedRanges = ranges.map(parseVersionRange);

  const matching = versions
    .filter((v) => parsedRanges.every((range) => satisfies(v, range)))
    .sort(compareVersions);

  return matching.length > 0 ? matching[matching.length - 1]! : null;
}
