import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { InstallTarget, PackageType, PlanmodeProjectConfig } from "../types/index.js";
import { addImport, listImports, removeImport } from "./claude-md.js";

export const INSTALL_TARGETS: InstallTarget[] = ["claude", "codex", "cursor"];
export const PROJECT_CONFIG_FILE = "planmode.config.yaml";
const AGENTS_FILE = "AGENTS.md";

function isInstallTarget(value: string): value is InstallTarget {
  return (INSTALL_TARGETS as string[]).includes(value);
}

export function parseTargets(values: string[] | string | undefined): InstallTarget[] {
  if (!values) return ["claude"];

  const raw = Array.isArray(values) ? values : [values];
  const names = raw
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (names.length === 0) {
    throw new Error("At least one target is required.");
  }

  for (const name of names) {
    if (name !== "all" && !isInstallTarget(name)) {
      throw new Error(
        `Unknown target "${name}". Choose one of: ${INSTALL_TARGETS.join(", ")}, or all.`,
      );
    }
  }

  if (names.includes("all")) return [...INSTALL_TARGETS];

  const targets: InstallTarget[] = [];
  for (const name of names) {
    if (!isInstallTarget(name)) continue;
    if (!targets.includes(name)) targets.push(name);
  }

  return targets;
}

export function readProjectConfig(projectDir: string = process.cwd()): PlanmodeProjectConfig {
  const configPath = path.join(projectDir, PROJECT_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};

  const raw = fs.readFileSync(configPath, "utf-8");
  const data = parse(raw) as PlanmodeProjectConfig | null;
  if (!data || typeof data !== "object") {
    throw new Error(`${PROJECT_CONFIG_FILE} must contain a YAML object.`);
  }
  return data;
}

export function resolveTargets(
  cliValues: string[] | string | undefined,
  projectDir: string = process.cwd(),
): InstallTarget[] {
  if (cliValues) return parseTargets(cliValues);

  const config = readProjectConfig(projectDir);
  if (config.targets) return parseTargets(config.targets);

  return ["claude"];
}

export function getEntryTargets(targets?: InstallTarget[]): InstallTarget[] {
  return targets && targets.length > 0 ? targets : ["claude"];
}

function codexStartMarker(name: string): string {
  return `<!-- planmode:start:${name} -->`;
}

function codexEndMarker(name: string): string {
  return `<!-- planmode:end:${name} -->`;
}

function codexSection(name: string, content: string): string {
  return `${codexStartMarker(name)}\n${content.trim()}\n${codexEndMarker(name)}`;
}

function upsertCodexSection(name: string, content: string, projectDir: string): void {
  const filePath = path.join(projectDir, AGENTS_FILE);
  const section = codexSection(name, content);
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8")
    : "# Planmode\n";

  const start = codexStartMarker(name);
  const end = codexEndMarker(name);
  const startIndex = existing.indexOf(start);

  let updated: string;
  if (startIndex !== -1) {
    const endIndex = existing.indexOf(end, startIndex);
    if (endIndex === -1) {
      throw new Error(`Malformed Planmode section for "${name}" in ${AGENTS_FILE}.`);
    }
    updated = existing.slice(0, startIndex) + section + existing.slice(endIndex + end.length);
  } else {
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    updated = `${existing}${separator}${section}\n`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, updated, "utf-8");
}

function removeCodexSection(name: string, projectDir: string): void {
  const filePath = path.join(projectDir, AGENTS_FILE);
  if (!fs.existsSync(filePath)) return;

  const existing = fs.readFileSync(filePath, "utf-8");
  const start = codexStartMarker(name);
  const end = codexEndMarker(name);
  const startIndex = existing.indexOf(start);
  if (startIndex === -1) return;

  const endIndex = existing.indexOf(end, startIndex);
  if (endIndex === -1) return;

  const before = existing.slice(0, startIndex).replace(/\n+$/, "");
  const after = existing.slice(endIndex + end.length).replace(/^\n+/, "");
  const updated = [before, after].filter(Boolean).join("\n\n");
  fs.writeFileSync(filePath, updated ? `${updated}\n` : "", "utf-8");
}

function cursorRulePath(name: string, projectDir: string): string {
  return path.join(projectDir, ".cursor", "rules", `${name}.mdc`);
}

function writeCursorRule(
  name: string,
  content: string,
  description: string,
  alwaysApply: boolean,
  projectDir: string,
): void {
  const filePath = cursorRulePath(name, projectDir);
  const frontmatter = stringify({
    description,
    alwaysApply,
  }).trim();
  const body = `---\n${frontmatter}\n---\n\n${content.trim()}\n`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf-8");
}

function removeCursorRule(name: string, projectDir: string): void {
  const filePath = cursorRulePath(name, projectDir);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
  const description = options.description ?? `${options.name} (${options.type})`;

  for (const target of options.targets) {
    switch (target) {
      case "claude":
        if (options.type === "plan") addImport(options.name, projectDir);
        break;

      case "codex":
        if (options.type === "rule") {
          upsertCodexSection(
            options.name,
            `## Rule: ${options.name}\n\n${options.content}`,
            projectDir,
          );
        } else if (options.type === "plan") {
          upsertCodexSection(
            options.name,
            `## Plan: ${options.name}\n\nRead \`plans/${options.name}.md\` before implementing tasks related to: ${description}`,
            projectDir,
          );
        }
        break;

      case "cursor":
        if (options.type === "rule") {
          writeCursorRule(
            options.name,
            options.content,
            description,
            true,
            projectDir,
          );
        } else if (options.type === "plan") {
          writeCursorRule(
            options.name,
            options.content,
            `Plan: ${description}`,
            false,
            projectDir,
          );
        }
        break;
    }
  }
}

export interface RemoveTargetOptions {
  targets: InstallTarget[];
  name: string;
  type: PackageType;
  projectDir?: string;
}

export function removeTargets(options: RemoveTargetOptions): void {
  const projectDir = options.projectDir ?? process.cwd();

  for (const target of options.targets) {
    switch (target) {
      case "claude":
        if (options.type === "plan") removeImport(options.name, projectDir);
        break;
      case "codex":
        removeCodexSection(options.name, projectDir);
        break;
      case "cursor":
        removeCursorRule(options.name, projectDir);
        break;
    }
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
  projectDir?: string;
}): TargetIssue[] {
  const projectDir = options.projectDir ?? process.cwd();
  const issues: TargetIssue[] = [];

  if (options.type === "prompt") return issues;

  for (const target of options.targets) {
    switch (target) {
      case "claude":
        if (options.type === "plan" && !listImports(projectDir).includes(options.name)) {
          issues.push({
            target,
            message: `Plan "${options.name}" is installed but missing from CLAUDE.md imports`,
          });
        }
        break;

      case "codex": {
        const filePath = path.join(projectDir, AGENTS_FILE);
        if (!fs.existsSync(filePath)) {
          issues.push({
            target,
            message: `AGENTS.md is missing for "${options.name}"`,
          });
          break;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(codexStartMarker(options.name)) || !content.includes(codexEndMarker(options.name))) {
          issues.push({
            target,
            message: `Planmode section for "${options.name}" is missing from AGENTS.md`,
          });
        }
        break;
      }

      case "cursor":
        if (!fs.existsSync(cursorRulePath(options.name, projectDir))) {
          issues.push({
            target,
            message: `Cursor rule for "${options.name}" is missing at .cursor/rules/${options.name}.mdc`,
          });
        }
        break;
    }
  }

  return issues;
}
