import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  CheckDefinition,
  GuardDefinition,
  GuardsFile,
  HarnessManifest,
} from "./types.js";

const HARNESS_FILES = [
  "harness.yaml",
  "harness.yml",
  "planmode.yaml",
  "planmode.yml",
];

export interface LoadedHarness {
  dir: string;
  file: string;
  manifest: HarnessManifest;
}

function findManifestFile(dir: string): string | null {
  for (const name of HARNESS_FILES) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function parseHarness(file: string): HarnessManifest {
  const raw = fs.readFileSync(file, "utf-8");
  const data = parse(raw) as HarnessManifest | null;
  if (!data || typeof data !== "object") {
    throw new Error(`${file} must contain a YAML object.`);
  }
  if (data.evals && !Array.isArray(data.evals)) {
    throw new Error(`${file}: evals must be a list.`);
  }
  if (
    data.verification?.commands &&
    !Array.isArray(data.verification.commands)
  ) {
    throw new Error(`${file}: verification.commands must be a list.`);
  }
  return data;
}

export function loadHarness(
  targetDir: string,
  explicit?: string,
): LoadedHarness | null {
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Harness not found: ${explicit}`);
    }
    const stat = fs.statSync(resolved);
    const file = stat.isDirectory() ? findManifestFile(resolved) : resolved;
    if (!file) {
      throw new Error(`No harness.yaml found in ${explicit}`);
    }
    return {
      dir: stat.isDirectory() ? resolved : path.dirname(resolved),
      file,
      manifest: parseHarness(file),
    };
  }

  const dotPlanmode = path.join(targetDir, ".planmode");
  const candidates = [
    path.join(dotPlanmode, "harness.yaml"),
    path.join(dotPlanmode, "harness.yml"),
    ...HARNESS_FILES.map((name) => path.join(targetDir, name)),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    return {
      dir: path.dirname(file),
      file,
      manifest: parseHarness(file),
    };
  }
  return null;
}

export function guardFilePath(
  targetDir: string,
  explicit?: string,
): string {
  return explicit
    ? path.resolve(explicit)
    : path.join(targetDir, ".planmode", "guards.yaml");
}

export function readGuardsFile(file: string): GuardsFile {
  if (!fs.existsSync(file)) return { version: 1, guards: [] };
  const raw = fs.readFileSync(file, "utf-8");
  const data = parse(raw) as GuardsFile | null;
  if (!data || typeof data !== "object") {
    throw new Error(`${file} must contain a YAML object.`);
  }
  if (!Array.isArray(data.guards)) {
    throw new Error(`${file}: guards must be a list.`);
  }
  return { version: data.version ?? 1, guards: data.guards };
}

export function readGuards(
  targetDir: string,
  explicit?: string,
): GuardsFile {
  return readGuardsFile(guardFilePath(targetDir, explicit));
}

export function checksFromHarness(
  manifest: HarnessManifest,
  includeCommands = true,
): CheckDefinition[] {
  const checks: CheckDefinition[] = [];

  for (const evalDef of manifest.evals ?? []) {
    checks.push({
      ...evalDef,
      severity: evalDef.severity ?? "error",
    });
  }

  if (includeCommands) {
    for (const command of manifest.verification?.commands ?? []) {
      checks.push({
        name: `command:${command.name}`,
        kind: "command",
        run: command.run,
        timeout: command.timeout,
        severity: "error",
      });
    }
  }

  return checks;
}

export function checksFromGuards(guards: GuardDefinition[]): CheckDefinition[] {
  return guards.map((guard) => ({
    ...guard.check,
    name: `guard:${guard.id}`,
    severity: guard.severity ?? "error",
    guard: guard.id,
  }));
}
