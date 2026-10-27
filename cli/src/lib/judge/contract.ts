import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { formatPath } from "../checks/glob.js";
import type {
  AcceptanceCriterion,
  Contract,
  LoadedContract,
} from "./types.js";

const CONTRACT_FILE = path.join(".planmode", "contract.yaml");

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`Contract field "${field}" must contain non-empty strings.`);
    }
    result.push(formatPath(item.trim()));
  }
  return result;
}

function asAcceptance(value: unknown): AcceptanceCriterion[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('Contract field "acceptance" must be a list.');
  }
  const result: AcceptanceCriterion[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      result.push({ criterion: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        'Contract acceptance entries must be strings or objects with a "criterion".',
      );
    }
    const record = item as Record<string, unknown>;
    const criterion =
      typeof record.criterion === "string"
        ? record.criterion.trim()
        : typeof record.text === "string"
          ? record.text.trim()
          : "";
    if (!criterion) {
      throw new Error('Contract acceptance entry is missing "criterion".');
    }
    if (
      record.check !== undefined &&
      (typeof record.check !== "string" || !record.check.trim())
    ) {
      throw new Error('Contract acceptance "check" must be a non-empty string.');
    }
    result.push({
      criterion,
      check: typeof record.check === "string" ? record.check.trim() : undefined,
    });
  }
  return result;
}

function asBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Contract field "${field}" must be a boolean.`);
  }
  return value;
}

function asPositiveInteger(
  value: unknown,
  field: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`Contract field "${field}" must be a positive integer.`);
  }
  return value as number;
}

function contractData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Contract must be a YAML object.");
  }
  const record = data as Record<string, unknown>;
  return record.contract ?? record;
}

export function normalizeContract(data: unknown): Contract {
  const raw = contractData(data);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Contract must be a YAML object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== undefined && record.version !== 1) {
    throw new Error(`Unsupported contract version: ${String(record.version)}`);
  }

  return {
    version: 1,
    acceptance: asAcceptance(record.acceptance),
    allowed_paths: asStringArray(record.allowed_paths, "allowed_paths"),
    protected_paths: asStringArray(record.protected_paths, "protected_paths"),
    allow_test_edits: asBoolean(
      record.allow_test_edits,
      "allow_test_edits",
      false,
    ),
    allow_dependency_changes: asBoolean(
      record.allow_dependency_changes,
      "allow_dependency_changes",
      false,
    ),
    allow_binary_changes: asBoolean(
      record.allow_binary_changes,
      "allow_binary_changes",
      false,
    ),
    max_changed_files: asPositiveInteger(
      record.max_changed_files,
      "max_changed_files",
      50,
    ),
    max_changed_lines: asPositiveInteger(
      record.max_changed_lines,
      "max_changed_lines",
      2000,
    ),
  };
}

export function contractHash(contract: Contract): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(contract))
    .digest("hex");
}

export function parseFrontmatter(content: string): {
  data?: unknown;
  body: string;
} {
  if (!content.startsWith("---")) return { body: content };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { body: content };
  return {
    data: parse(match[1]!),
    body: content.slice(match[0].length),
  };
}

export function readContractFile(file: string): LoadedContract {
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = parse(raw);
  const contract = normalizeContract(parsed);
  return {
    contract,
    hash: contractHash(contract),
    file,
    source: "contract-file",
  };
}

export interface LoadContractOptions {
  planPath?: string;
  contractPath?: string;
  projectDir?: string;
}

export function loadContract(
  options: LoadContractOptions = {},
): LoadedContract | undefined {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());

  if (options.contractPath) {
    const file = path.resolve(options.contractPath);
    if (!fs.existsSync(file)) {
      throw new Error(`Contract not found: ${options.contractPath}`);
    }
    return readContractFile(file);
  }

  if (options.planPath) {
    const planFile = path.resolve(options.planPath);
    if (!fs.existsSync(planFile)) {
      throw new Error(`Plan not found: ${options.planPath}`);
    }
    const content = fs.readFileSync(planFile, "utf-8");
    const { data } = parseFrontmatter(content);
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (record.contract !== undefined) {
        const contract = normalizeContract(record);
        return {
          contract,
          hash: contractHash(contract),
          file: planFile,
          source: "plan-frontmatter",
        };
      }
    }
  }

  const file = path.join(projectDir, CONTRACT_FILE);
  if (fs.existsSync(file)) return readContractFile(file);
  return undefined;
}

export function formatContractForPrompt(loaded: LoadedContract): string {
  const contract = loaded.contract;
  const lines: string[] = [];
  lines.push(`Contract hash: ${loaded.hash}`);
  lines.push(`Source: ${loaded.file ?? "inline"}`);
  lines.push("");
  if (contract.acceptance.length > 0) {
    lines.push("Acceptance criteria:");
    for (const item of contract.acceptance) {
      lines.push(
        `- ${item.criterion}${item.check ? ` (check: ${item.check})` : ""}`,
      );
    }
    lines.push("");
  }
  if (contract.allowed_paths.length > 0) {
    lines.push("Allowed paths:");
    for (const item of contract.allowed_paths) lines.push(`- ${item}`);
    lines.push("");
  }
  if (contract.protected_paths.length > 0) {
    lines.push("Additional protected paths:");
    for (const item of contract.protected_paths) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push(
    `Test edits allowed: ${contract.allow_test_edits ? "yes" : "no"}`,
  );
  lines.push(
    `Dependency changes allowed: ${contract.allow_dependency_changes ? "yes" : "no"}`,
  );
  lines.push(
    `Binary changes allowed: ${contract.allow_binary_changes ? "yes" : "no"}`,
  );
  lines.push(`Max changed files: ${contract.max_changed_files}`);
  lines.push(`Max changed lines: ${contract.max_changed_lines}`);
  return lines.join("\n");
}
