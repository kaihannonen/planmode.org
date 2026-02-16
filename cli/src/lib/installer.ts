import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PackageManifest, PackageType, LockfileEntry, ResolvedPackage } from "../types/index.js";
import { resolveVersion, parseDepString } from "./resolver.js";
import { fetchVersionMetadata, fetchPackageMetadata } from "./registry.js";
import { fetchFileAtTag } from "./git.js";
import { addToLockfile, removeFromLockfile, getLockedVersion } from "./lockfile.js";
import { addImport, removeImport } from "./claude-md.js";
import { parseManifest, readPackageContent } from "./manifest.js";
import { renderTemplate, collectVariableValues } from "./template.js";
import { logger } from "./logger.js";
import { trackDownload } from "./analytics.js";

function getInstallDir(type: PackageType): string {
  switch (type) {
    case "plan":
      return "plans";
    case "rule":
      return path.join(".claude", "rules");
    case "prompt":
      return "prompts";
  }
}

function getInstallPath(name: string, type: PackageType): string {
  return path.join(getInstallDir(type), `${name}.md`);
}

function contentHash(content: string): string {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

export interface InstallOptions {
  version?: string;
  forceRule?: boolean;
  noInput?: boolean;
  variables?: Record<string, string>;
  projectDir?: string;
}

export async function installPackage(
  packageName: string,
  options: InstallOptions = {},
): Promise<void> {
  const projectDir = options.projectDir ?? process.cwd();

  // Check lockfile first
  const locked = getLockedVersion(packageName, projectDir);
  if (locked && !options.version) {
    logger.dim(`${packageName}@${locked.version} already installed`);
    return;
  }

  // Resolve version
  logger.info(`Resolving ${packageName}...`);
  const { version, metadata } = await resolveVersion(packageName, options.version);

  // Fetch version metadata
  const versionMeta = await fetchVersionMetadata(packageName, version);

  // Fetch manifest
  logger.info(`Fetching ${packageName}@${version}...`);
  const basePath = versionMeta.source.path ? `${versionMeta.source.path}/` : "";
  const manifestRaw = await fetchFileAtTag(
    versionMeta.source.repository,
    versionMeta.source.tag,
    `${basePath}planmode.yaml`,
  );
  const manifest = parseManifest(manifestRaw);

  // Fetch content
  let content: string;
  if (manifest.content) {
    content = manifest.content;
  } else if (manifest.content_file) {
    content = await fetchFileAtTag(
      versionMeta.source.repository,
      versionMeta.source.tag,
      `${basePath}${manifest.content_file}`,
    );
  } else {
    throw new Error("Package has no content or content_file");
  }

  // Process variables if templated
  if (manifest.variables && Object.keys(manifest.variables).length > 0) {
    const provided = options.variables ?? {};
    if (options.noInput) {
      const values = collectVariableValues(manifest.variables, provided);
      content = renderTemplate(content, values);
    } else {
      // Use defaults for non-provided values
      const values = collectVariableValues(manifest.variables, provided);
      content = renderTemplate(content, values);
    }
  }

  // Determine type (--rule overrides)
  const type = options.forceRule ? "rule" : manifest.type;
  const installPath = getInstallPath(packageName, type);
  const fullPath = path.join(projectDir, installPath);

  // Check for conflicts
  if (fs.existsSync(fullPath)) {
    const existingContent = fs.readFileSync(fullPath, "utf-8");
    const existingHash = contentHash(existingContent);
    const newHash = contentHash(content);
    if (existingHash === newHash) {
      logger.dim(`${packageName} already installed (identical content)`);
    } else {
      logger.warn(`Overwriting ${installPath} with new content`);
    }
  }

  // Create directory and write file
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  logger.success(`Installed ${packageName}@${version} → ${installPath}`);
  trackDownload(packageName);

  // Update CLAUDE.md for plans
  if (type === "plan") {
    addImport(packageName, projectDir);
    logger.dim(`Added @import to CLAUDE.md`);
  }

  // Update lockfile
  const hash = contentHash(content);
  const entry: LockfileEntry = {
    version,
    type,
    source: versionMeta.source.repository,
    tag: versionMeta.source.tag,
    sha: versionMeta.source.sha,
    content_hash: hash,
    installed_to: installPath,
  };
  addToLockfile(packageName, entry, projectDir);

  // Install dependencies
  if (manifest.dependencies) {
    const deps = [
      ...(manifest.dependencies.rules ?? []).map((d) => ({ dep: d, type: "rule" as const })),
      ...(manifest.dependencies.plans ?? []).map((d) => ({ dep: d, type: "plan" as const })),
    ];

    for (const { dep } of deps) {
      const { name, range } = parseDepString(dep);
      await installPackage(name, {
        version: range === "*" ? undefined : range,
        projectDir,
        noInput: options.noInput,
      });
    }
  }
}

export async function uninstallPackage(
  packageName: string,
  projectDir: string = process.cwd(),
): Promise<void> {
  const locked = getLockedVersion(packageName, projectDir);
  if (!locked) {
    throw new Error(`Package '${packageName}' is not installed.`);
  }

  // Remove file
  const fullPath = path.join(projectDir, locked.installed_to);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logger.success(`Removed ${locked.installed_to}`);
  }

  // Remove import from CLAUDE.md
  if (locked.type === "plan") {
    removeImport(packageName, projectDir);
    logger.dim(`Removed @import from CLAUDE.md`);
  }

  // Update lockfile
  removeFromLockfile(packageName, projectDir);
  logger.success(`Uninstalled ${packageName}`);
}

export async function updatePackage(
  packageName: string,
  projectDir: string = process.cwd(),
): Promise<boolean> {
  const locked = getLockedVersion(packageName, projectDir);
  if (!locked) {
    throw new Error(`Package '${packageName}' is not installed.`);
  }

  const { version, metadata } = await resolveVersion(packageName);
  if (version === locked.version) {
    logger.dim(`${packageName}@${version} is already up to date`);
    return false;
  }

  logger.info(`Updating ${packageName}: ${locked.version} → ${version}`);

  // Uninstall old, install new
  await uninstallPackage(packageName, projectDir);
  await installPackage(packageName, { version, projectDir });
  return true;
}
