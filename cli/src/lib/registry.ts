import fs from "node:fs";
import path from "node:path";
import { getCacheDir, getCacheTTL, getRegistries, getGitHubToken } from "./config.js";
import type { RegistryIndex, PackageSummary, PackageMetadata, VersionMetadata } from "../types/index.js";

const INDEX_CACHE_FILE = "index.json";

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3.raw+json",
    "User-Agent": "planmode-cli",
  };
  const token = getGitHubToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function registryRawUrl(registryUrl: string, filePath: string): string {
  // Convert github.com/org/repo to raw.githubusercontent.com URL
  const match = registryUrl.match(/^github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Invalid registry URL: ${registryUrl}`);
  }
  return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/${filePath}`;
}

function resolveRegistry(packageName: string): string {
  const registries = getRegistries();

  // Scoped packages: @scope/name → look up scope in registries
  if (packageName.startsWith("@")) {
    const scope = packageName.split("/")[0]!.slice(1);
    const registryUrl = registries[scope];
    if (!registryUrl) {
      throw new Error(
        `No registry configured for scope "@${scope}". Run: planmode registry add ${scope} <url>`,
      );
    }
    return registryUrl;
  }

  return registries["default"]!;
}

export async function fetchIndex(registryUrl?: string): Promise<RegistryIndex> {
  const url = registryUrl ?? getRegistries()["default"]!;
  const cacheDir = getCacheDir();
  const cachePath = path.join(cacheDir, INDEX_CACHE_FILE);
  const ttl = getCacheTTL();

  // Check cache
  try {
    const stat = fs.statSync(cachePath);
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    if (ageSeconds < ttl) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return cached as RegistryIndex;
    }
  } catch {
    // Cache miss
  }

  // Fetch from remote
  const rawUrl = registryRawUrl(url, "index.json");
  const response = await fetch(rawUrl, { headers: getHeaders() });
  if (!response.ok) {
    throw new Error(`Failed to fetch registry index: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as RegistryIndex;

  // Write cache
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf-8");

  return data;
}

export async function searchPackages(
  query: string,
  options?: { type?: string; category?: string },
): Promise<PackageSummary[]> {
  const index = await fetchIndex();
  const q = query.toLowerCase();

  let results = index.packages.filter((pkg) => {
    const searchable = [pkg.name, pkg.description, pkg.author, ...pkg.tags].join(" ").toLowerCase();
    return searchable.includes(q);
  });

  if (options?.type) {
    results = results.filter((pkg) => pkg.type === options.type);
  }
  if (options?.category) {
    results = results.filter((pkg) => pkg.category === options.category);
  }

  return results.sort((a, b) => b.downloads - a.downloads);
}

export async function fetchPackageMetadata(packageName: string): Promise<PackageMetadata> {
  const registryUrl = resolveRegistry(packageName);
  const name = packageName.startsWith("@") ? packageName.split("/")[1]! : packageName;
  const rawUrl = registryRawUrl(registryUrl, `packages/${name}/metadata.json`);

  const response = await fetch(rawUrl, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Package '${packageName}' not found in registry. Run \`planmode search <query>\` to find packages.`,
      );
    }
    throw new Error(`Failed to fetch package metadata: ${response.status}`);
  }
  return (await response.json()) as PackageMetadata;
}

export async function fetchVersionMetadata(
  packageName: string,
  version: string,
): Promise<VersionMetadata> {
  const registryUrl = resolveRegistry(packageName);
  const name = packageName.startsWith("@") ? packageName.split("/")[1]! : packageName;
  const rawUrl = registryRawUrl(registryUrl, `packages/${name}/versions/${version}.json`);

  const response = await fetch(rawUrl, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Version '${version}' not found for '${packageName}'.`);
    }
    throw new Error(`Failed to fetch version metadata: ${response.status}`);
  }
  return (await response.json()) as VersionMetadata;
}
