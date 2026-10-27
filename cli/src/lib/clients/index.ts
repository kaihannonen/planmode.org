import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  InstallTarget,
  PackageType,
  PlanmodeProjectConfig,
} from "../../types/index.js";
import type { ClientAdapter, ClientId } from "./types.js";
import { CLIENT_IDS } from "./types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { opencodeAdapter } from "./opencode.js";

export { CLIENT_IDS };
export type { ClientAdapter, ClientCapabilities, ClientId } from "./types.js";

export const PROJECT_CONFIG_FILE = "planmode.config.yaml";

const ADAPTERS: Record<ClientId, ClientAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  opencode: opencodeAdapter,
};

export function getClientAdapter(id: ClientId): ClientAdapter {
  return ADAPTERS[id];
}

export function listClientAdapters(): ClientAdapter[] {
  return CLIENT_IDS.map((id) => ADAPTERS[id]);
}

export function isClientId(value: string): value is ClientId {
  return (CLIENT_IDS as string[]).includes(value);
}

export function readProjectConfig(
  projectDir: string = process.cwd(),
): PlanmodeProjectConfig {
  const configPath = path.join(projectDir, PROJECT_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};

  const raw = fs.readFileSync(configPath, "utf-8");
  const data = parse(raw) as PlanmodeProjectConfig | null;
  if (!data || typeof data !== "object") {
    throw new Error(`${PROJECT_CONFIG_FILE} must contain a YAML object.`);
  }
  return data;
}

export function parseTargets(
  values: string[] | string | undefined,
  fallback: InstallTarget[] = ["claude"],
): InstallTarget[] {
  if (!values) return [...fallback];

  const raw = Array.isArray(values) ? values : [values];
  const names = raw
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (names.length === 0) {
    throw new Error("At least one install target is required.");
  }

  for (const name of names) {
    if (name !== "all" && !isClientId(name)) {
      throw new Error(
        `Unknown target "${name}". Choose one of: ${CLIENT_IDS.join(", ")}, or all.`,
      );
    }
  }

  if (names.includes("all")) return [...CLIENT_IDS];

  const targets: InstallTarget[] = [];
  for (const name of names) {
    if (!isClientId(name)) continue;
    if (!targets.includes(name)) targets.push(name);
  }
  return targets;
}

export function resolveTargets(
  cliValues: string[] | string | undefined,
  projectDir: string = process.cwd(),
): InstallTarget[] {
  if (cliValues) return parseTargets(cliValues);

  const config = readProjectConfig(projectDir);
  if (config.targets && config.targets.length > 0) {
    return parseTargets(config.targets);
  }

  return ["claude"];
}

export function getEntryTargets(targets?: InstallTarget[]): InstallTarget[] {
  return targets && targets.length > 0 ? targets : ["claude"];
}

export interface ApplyTargetOptions {
  targets: InstallTarget[];
  name: string;
  type: PackageType;
  content: string;
  description?: string;
  projectDir?: string;
}

export function applyTargets(options: ApplyTargetOptions): void {
  const projectDir = options.projectDir ?? process.cwd();
  for (const target of options.targets) {
    ADAPTERS[target].apply({
      name: options.name,
      type: options.type,
      content: options.content,
      description: options.description,
      projectDir,
    });
  }
}

export interface RemoveTargetOptions {
  targets: InstallTarget[];
  name: string;
  type: PackageType;
  description?: string;
  projectDir?: string;
}

export function removeTargets(options: RemoveTargetOptions): void {
  const projectDir = options.projectDir ?? process.cwd();
  for (const target of options.targets) {
    ADAPTERS[target].remove({
      name: options.name,
      type: options.type,
      description: options.description,
      projectDir,
    });
  }
}

export interface TargetIssue {
  target: InstallTarget;
  message: string;
}

export function checkTargets(options: {
  targets: InstallTarget[];
  name: string;
  type: PackageType;
  description?: string;
  projectDir?: string;
}): TargetIssue[] {
  const projectDir = options.projectDir ?? process.cwd();
  const issues: TargetIssue[] = [];

  for (const target of options.targets) {
    for (const message of ADAPTERS[target].check({
      name: options.name,
      type: options.type,
      description: options.description,
      projectDir,
    })) {
      issues.push({ target, message });
    }
  }
  return issues;
}

export interface DetectedClient {
  id: ClientId;
  label: string;
  files: string[];
  capabilities: ClientAdapter["capabilities"];
}

export function detectClients(
  projectDir: string = process.cwd(),
): DetectedClient[] {
  const detected: DetectedClient[] = [];
  for (const adapter of listClientAdapters()) {
    const files = adapter
      .instructionFiles(projectDir)
      .filter((file) => fs.existsSync(file));
    if (files.length > 0) {
      detected.push({
        id: adapter.id,
        label: adapter.label,
        files: files.map((file) => path.relative(projectDir, file) || "."),
        capabilities: adapter.capabilities,
      });
    }
  }
  return detected;
}

export function capabilitiesReport(): Array<{
  id: ClientId;
  label: string;
  capabilities: ClientAdapter["capabilities"];
}> {
  return listClientAdapters().map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    capabilities: adapter.capabilities,
  }));
}
