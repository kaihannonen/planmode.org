import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CheckReport } from "../checks/types.js";
import { changedSnapshotFiles, snapshotTree } from "./diff.js";
import type {
  DiffReport,
  LoadedContract,
  SemanticFinding,
  SemanticReview,
  SemanticVerdict,
} from "./types.js";

export interface SemanticReviewOptions {
  command: string;
  workspace: string;
  prompt: string;
  outputFile: string;
  promptFile?: string;
  timeoutSeconds?: number;
  /** Orchestration state that the reviewer may write to without being flagged. */
  excludePaths?: string[];
}

interface SemanticPayload {
  verdict?: unknown;
  summary?: unknown;
  findings?: unknown;
}

function parsePayload(raw: string): SemanticPayload | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as SemanticPayload;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as SemanticPayload;
    } catch {
      return undefined;
    }
  }
}

function normalizeFindings(value: unknown): SemanticFinding[] {
  if (!Array.isArray(value)) return [];
  const findings: SemanticFinding[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    if (!message) continue;
    findings.push({
      severity: record.severity === "error" ? "error" : "warn",
      message,
      file: typeof record.file === "string" ? record.file : undefined,
    });
  }
  return findings;
}

function normalizeVerdict(value: unknown): SemanticVerdict | undefined {
  return value === "pass" || value === "fail" || value === "needs_human"
    ? value
    : undefined;
}

export function buildSemanticPrompt(options: {
  plan?: string;
  contract?: LoadedContract;
  check: CheckReport;
  diff: DiffReport;
  promptFile: string;
  outputFile: string;
}): string {
  const lines: string[] = [];
  lines.push("You are the independent semantic reviewer in a development loop.");
  lines.push("");
  lines.push("You are not the builder. Do not edit any files.");
  lines.push("Read the plan, the contract, the diff audit, and the workspace.");
  lines.push("Decide whether the change satisfies the contract criteria.");
  lines.push("");
  lines.push("Write a JSON result to this path:");
  lines.push(options.outputFile);
  lines.push("");
  lines.push("Required shape:");
  lines.push("{");
  lines.push('  "verdict": "pass" | "fail" | "needs_human",');
  lines.push('  "summary": "one paragraph",');
  lines.push(
    '  "findings": [{"severity": "error" | "warn", "message": "...", "file": "..."}]',
  );
  lines.push("}");
  lines.push("");
  lines.push("Rules:");
  lines.push("- A deterministic check failure is not yours to override.");
  lines.push("- Use needs_human when the intent is ambiguous or the risk is high.");
  lines.push("- Do not ask for secrets or inspect files outside the workspace.");
  lines.push("");

  if (options.contract) {
    lines.push("## Contract");
    lines.push("");
    lines.push(options.contract.contract.acceptance.length > 0
      ? options.contract.contract.acceptance
          .map(
            (item) =>
              `- ${item.criterion}${item.check ? ` (check: ${item.check})` : ""}`,
          )
          .join("\n")
      : "_No explicit acceptance criteria._");
    lines.push("");
  }

  lines.push("## Plan");
  lines.push("");
  lines.push(options.plan?.trim() || "_No plan supplied._");
  lines.push("");

  lines.push("## Deterministic checks");
  lines.push("");
  lines.push(
    `- Passed: ${options.check.passed}, failed: ${options.check.failed}, errors: ${options.check.errors}, skipped: ${options.check.skipped}`,
  );
  if (options.check.new_failures.length > 0) {
    lines.push(`- New failures: ${options.check.new_failures.join(", ")}`);
  }
  if (options.check.not_verified.length > 0) {
    lines.push(`- Not verified: ${options.check.not_verified.join("; ")}`);
  }
  lines.push("");

  lines.push("## Diff summary");
  lines.push("");
  lines.push(
    `- Changed files: ${options.diff.summary.changed_files} (${options.diff.summary.added} added, ${options.diff.summary.modified} modified, ${options.diff.summary.deleted} deleted)`,
  );
  for (const file of options.diff.files) {
    lines.push(`- ${file.status}: ${file.path}`);
  }
  if (options.diff.findings.length > 0) {
    lines.push("");
    lines.push("## Diff findings");
    lines.push("");
    for (const item of options.diff.findings) {
      lines.push(`- [${item.severity}] ${item.message}${item.file ? ` (${item.file})` : ""}`);
    }
  }
  lines.push("");
  lines.push(`Prompt file: ${options.promptFile}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function runSemanticReview(
  options: SemanticReviewOptions,
): SemanticReview {
  const startedAt = Date.now();
  const promptFile =
    options.promptFile ?? `${options.outputFile}.prompt.md`;
  fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
  fs.mkdirSync(path.dirname(promptFile), { recursive: true });
  // Never accept a stale verdict from a previous reviewer run.
  fs.rmSync(options.outputFile, { force: true });
  fs.writeFileSync(promptFile, options.prompt, "utf-8");

  const before = snapshotTree(options.workspace, options.excludePaths);
  const env = {
    ...process.env,
    PLANMODE_JUDGE_PROMPT: options.prompt,
    PLANMODE_JUDGE_PROMPT_FILE: promptFile,
    PLANMODE_JUDGE_OUTPUT: options.outputFile,
    PLANMODE_JUDGE_WORKSPACE: options.workspace,
    CI: "1",
    NO_COLOR: "1",
  };
  const proc = spawnSync(options.command, {
    cwd: options.workspace,
    shell: true,
    encoding: "utf8",
    timeout: (options.timeoutSeconds ?? 300) * 1000,
    maxBuffer: 20 * 1024 * 1024,
    env,
  });
  const after = snapshotTree(options.workspace, options.excludePaths);
  const edits = changedSnapshotFiles(before, after);

  const fileRaw = fs.existsSync(options.outputFile)
    ? fs.readFileSync(options.outputFile, "utf-8")
    : "";
  const streamRaw = `${proc.stdout ?? ""}\n${proc.stderr ?? ""}`.trim();
  const payload = parsePayload(fileRaw) ?? parsePayload(streamRaw);
  const raw = fileRaw || streamRaw;
  const verdict = normalizeVerdict(payload?.verdict);
  const findings = normalizeFindings(payload?.findings);

  if (edits.length > 0) {
    return {
      status: "needs_human",
      summary: `Semantic reviewer modified the workspace: ${edits.join(", ")}`,
      findings: [
        {
          severity: "error",
          message: `Semantic reviewer modified files: ${edits.join(", ")}`,
        },
      ],
      command: options.command,
      duration_ms: Date.now() - startedAt,
      output_file: options.outputFile,
      raw: raw.slice(0, 8000),
    };
  }

  if (!verdict) {
    const code = proc.status ?? "?";
    return {
      status: "inconclusive",
      summary:
        `Semantic reviewer did not write a valid JSON verdict (exit ${code}).`,
      findings,
      command: options.command,
      duration_ms: Date.now() - startedAt,
      output_file: options.outputFile,
      raw: raw.slice(0, 8000),
    };
  }

  if (verdict === "pass" && (proc.error || proc.status !== 0)) {
    const code = proc.status ?? "?";
    return {
      status: "inconclusive",
      summary:
        `Semantic reviewer returned pass but exited ${code}; refusing to accept it.`,
      findings,
      command: options.command,
      duration_ms: Date.now() - startedAt,
      output_file: options.outputFile,
      raw: raw.slice(0, 8000),
    };
  }

  return {
    status: verdict,
    summary:
      typeof payload?.summary === "string" && payload.summary.trim()
        ? payload.summary.trim()
        : `Semantic verdict: ${verdict}`,
    findings,
    command: options.command,
    duration_ms: Date.now() - startedAt,
    output_file: options.outputFile,
    raw: raw.slice(0, 8000),
  };
}
