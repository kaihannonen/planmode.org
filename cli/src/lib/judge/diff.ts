import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { formatPath, globToRegExp } from "../checks/glob.js";
import type { Contract, DiffFile, DiffFinding, DiffReport } from "./types.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".turbo",
  ".astro",
]);

const DEFAULT_PROTECTED = [
  ".planmode/guards.yaml",
  ".planmode/harness.yaml",
  ".planmode/contract.yaml",
  "harness.yaml",
  "planmode.yaml",
  ".github/**",
];

const TEST_PATTERNS = [
  "**/tests/**",
  "**/test/**",
  "**/__tests__/**",
  "**/e2e/**",
  "**/cypress/**",
  "**/playwright/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.go",
  "**/test_*.py",
  "**/*_test.py",
  "**/*Test.java",
  "**/*Tests.cs",
  "**/*.snap",
];

const DEPENDENCY_PATTERNS = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "pyproject.toml",
  "poetry.lock",
  "requirements*.txt",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "*.csproj",
  "packages.lock.json",
  "mix.exs",
  "mix.lock",
  "pubspec.yaml",
  "pubspec.lock",
];

const SECRET_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  severity: "error" | "warn";
}> = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    severity: "error",
  },
  {
    label: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    severity: "error",
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    severity: "error",
  },
  {
    label: "OpenAI-style key",
    pattern: /\bsk-[A-Za-z0-9]{20,}\b/,
    severity: "warn",
  },
  {
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    severity: "error",
  },
  {
    label: "hard-coded credential",
    pattern:
      /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][^"']{8,}["']/i,
    severity: "warn",
  },
];

const STUB_PATTERN =
  /\b(?:TODO|FIXME|NotImplemented|not implemented|throw new Error\(["']not implemented)/i;

export interface TreeEntry {
  hash: string;
  lines?: number;
  binary: boolean;
}

export type TreeSnapshot = Record<string, TreeEntry>;

interface TextFile {
  text?: string;
  binary: boolean;
  lines: number;
}

function hasGlob(value: string): boolean {
  return /[*?{]/.test(value);
}

function matchesAny(file: string, patterns: string[]): boolean {
  for (const rawPattern of patterns) {
    const pattern = formatPath(rawPattern.trim());
    if (!pattern) continue;
    if (hasGlob(pattern)) {
      if (globToRegExp(pattern).test(file)) return true;
    } else if (file === pattern || file.startsWith(`${pattern}/`)) {
      return true;
    }
  }
  return false;
}

function isExcluded(target: string, excludes: string[]): boolean {
  for (const exclude of excludes) {
    if (target === exclude || target.startsWith(`${exclude}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

function walkDiffFiles(root: string, excludes: string[] = []): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (isExcluded(full, excludes)) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const relative = formatPath(path.relative(root, full));
        if (
          relative === ".planmode/loop" ||
          relative.startsWith(".planmode/loop/") ||
          relative === ".planmode/runs" ||
          relative.startsWith(".planmode/runs/") ||
          relative === ".planmode/judge" ||
          relative.startsWith(".planmode/judge/")
        ) {
          continue;
        }
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

function readText(file: string): TextFile {
  const buffer = fs.readFileSync(file);
  const binary = buffer.subarray(0, 8000).includes(0);
  if (binary) return { binary: true, lines: 0 };
  const text = buffer.toString("utf-8");
  return {
    text,
    binary: false,
    lines: text.split(/\r?\n/).length,
  };
}

export function snapshotTree(
  root: string,
  excludePaths: string[] = [],
): TreeSnapshot {
  const snapshot: Record<string, TreeEntry> = {};
  const excludes = excludePaths.map((entry) => path.resolve(entry));
  for (const file of walkDiffFiles(root, excludes)) {
    const relative = formatPath(path.relative(root, file));
    const buffer = fs.readFileSync(file);
    const binary = buffer.subarray(0, 8000).includes(0);
    snapshot[relative] = {
      hash: crypto.createHash("sha256").update(buffer).digest("hex"),
      binary,
      lines: binary ? undefined : buffer.toString("utf-8").split(/\r?\n/).length,
    };
  }
  return snapshot;
}

function addedLines(before: string | undefined, after: string | undefined): string[] {
  if (!after) return [];
  if (!before) return after.split(/\r?\n/).filter((line) => line.trim());
  const previous = new Set(before.split(/\r?\n/));
  return after
    .split(/\r?\n/)
    .filter((line) => line.trim() && !previous.has(line));
}

function finding(
  id: string,
  severity: DiffFinding["severity"],
  category: DiffFinding["category"],
  message: string,
  file?: string,
  detail?: string,
): DiffFinding {
  return { id, severity, category, message, file, detail };
}

export interface AuditDiffOptions {
  baseDir: string;
  targetDir: string;
  contract?: Contract;
  protectedPaths?: string[];
  testPaths?: string[];
  dependencyPaths?: string[];
  /** Absolute paths that belong to orchestration state, not the project diff. */
  excludePaths?: string[];
}

export function auditDiff(options: AuditDiffOptions): DiffReport {
  const baseDir = path.resolve(options.baseDir);
  const targetDir = path.resolve(options.targetDir);
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    throw new Error(`Diff base must be a directory: ${baseDir}`);
  }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Diff target must be a directory: ${targetDir}`);
  }
  if (baseDir === targetDir) {
    throw new Error("Diff base and target must be different directories.");
  }
  const baseInsideTarget = path.relative(targetDir, baseDir);
  const targetInsideBase = path.relative(baseDir, targetDir);
  if (
    (baseInsideTarget &&
      !baseInsideTarget.startsWith("..") &&
      !path.isAbsolute(baseInsideTarget)) ||
    (targetInsideBase &&
      !targetInsideBase.startsWith("..") &&
      !path.isAbsolute(targetInsideBase))
  ) {
    throw new Error("Diff base and target must not contain each other.");
  }

  const contract = options.contract;
  const excludes = (options.excludePaths ?? []).map((entry) =>
    path.resolve(entry),
  );
  const before = snapshotTree(baseDir, excludes);
  const after = snapshotTree(targetDir, excludes);
  const findings: DiffFinding[] = [];
  const files: DiffFile[] = [];
  let changedLines = 0;

  const allPaths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const relative of allPaths) {
    const oldEntry = before[relative];
    const newEntry = after[relative];
    if (oldEntry?.hash === newEntry?.hash) continue;

    const status: DiffFile["status"] = !oldEntry
      ? "added"
      : !newEntry
        ? "deleted"
        : "modified";
    const beforeText =
      oldEntry && !oldEntry.binary
        ? readText(path.join(baseDir, relative))
        : undefined;
    const afterText =
      newEntry && !newEntry.binary
        ? readText(path.join(targetDir, relative))
        : undefined;

    let linesAdded = 0;
    let linesRemoved = 0;
    if (status === "added") {
      linesAdded = afterText?.lines ?? 0;
    } else if (status === "deleted") {
      linesRemoved = beforeText?.lines ?? 0;
    } else {
      const added = addedLines(beforeText?.text, afterText?.text);
      const removed = addedLines(afterText?.text, beforeText?.text);
      linesAdded = added.length;
      linesRemoved = removed.length;
    }
    changedLines += linesAdded + linesRemoved;

    files.push({
      path: relative,
      status,
      before_hash: oldEntry?.hash,
      after_hash: newEntry?.hash,
      lines_before: beforeText?.lines,
      lines_after: afterText?.lines,
      binary: beforeText?.binary || afterText?.binary || undefined,
    });

    if (oldEntry?.binary || newEntry?.binary) {
      findings.push(
        finding(
          `binary:${relative}`,
          "warn",
          "binary",
          "Binary file changed; review it manually.",
          relative,
        ),
      );
    }

    for (const line of addedLines(beforeText?.text, afterText?.text)) {
      for (const secret of SECRET_PATTERNS) {
        if (secret.pattern.test(line)) {
          findings.push(
            finding(
              `secret:${relative}:${secret.label}`,
              secret.severity,
              "secret",
              `Possible ${secret.label} added.`,
              relative,
              line.trim().slice(0, 200),
            ),
          );
        }
      }
      if (STUB_PATTERN.test(line)) {
        findings.push(
          finding(
            `stub:${relative}`,
            "warn",
            "quality",
            "Added line looks like a stub or TODO.",
            relative,
            line.trim().slice(0, 200),
          ),
        );
      }
    }
  }

  const protectedPaths = [
    ...DEFAULT_PROTECTED,
    ...(contract?.protected_paths ?? []),
    ...(options.protectedPaths ?? []),
  ];
  for (const file of files) {
    if (matchesAny(file.path, protectedPaths)) {
      findings.push(
        finding(
          `protected:${file.path}`,
          "error",
          "protected",
          "Changed a protected file.",
          file.path,
        ),
      );
    }
  }

  if (contract && contract.allowed_paths.length > 0) {
    for (const file of files) {
      if (!matchesAny(file.path, contract.allowed_paths)) {
        findings.push(
          finding(
            `scope:${file.path}`,
            "error",
            "scope",
            "Changed a file outside the contract's allowed paths.",
            file.path,
          ),
        );
      }
    }
  }

  if (!contract?.allow_test_edits) {
    for (const file of files) {
      if (file.status === "added") continue;
      if (matchesAny(file.path, options.testPaths ?? TEST_PATTERNS)) {
        findings.push(
          finding(
            `test-edit:${file.path}`,
            "error",
            "tests",
            "Existing test file was changed or deleted.",
            file.path,
          ),
        );
      }
    }
  }

  if (!contract?.allow_dependency_changes) {
    for (const file of files) {
      if (matchesAny(file.path, options.dependencyPaths ?? DEPENDENCY_PATTERNS)) {
        findings.push(
          finding(
            `dependency:${file.path}`,
            "error",
            "dependencies",
            "Dependency manifest or lockfile changed.",
            file.path,
          ),
        );
      }
    }
  }

  const maxFiles = contract?.max_changed_files ?? 50;
  const maxLines = contract?.max_changed_lines ?? 2000;
  if (files.length === 0) {
    findings.push(
      finding(
        "no-change",
        "error",
        "no-change",
        "No project files changed. A passing loop must produce a change.",
      ),
    );
  }
  if (files.length > maxFiles) {
    findings.push(
      finding(
        "too-many-files",
        "error",
        "size",
        `Changed ${files.length} files; the limit is ${maxFiles}.`,
      ),
    );
  }
  if (changedLines > maxLines) {
    findings.push(
      finding(
        "too-many-lines",
        "error",
        "size",
        `Changed about ${changedLines} lines; the limit is ${maxLines}.`,
      ),
    );
  }

  for (const file of files) {
    if (file.status === "deleted") {
      findings.push(
        finding(
          `deleted:${file.path}`,
          "warn",
          "quality",
          "File deleted; confirm this was intentional.",
          file.path,
        ),
      );
    }
    if ((file.lines_before ?? 0) > 200 && file.status !== "added") {
      findings.push(
        finding(
          `large-change:${file.path}`,
          "warn",
          "size",
          "Large existing file changed; review the diff carefully.",
          file.path,
        ),
      );
    }
  }

  const hasError = findings.some((item) => item.severity === "error");
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    base: baseDir,
    target: targetDir,
    files,
    summary: {
      added: files.filter((file) => file.status === "added").length,
      modified: files.filter((file) => file.status === "modified").length,
      deleted: files.filter((file) => file.status === "deleted").length,
      changed_files: files.length,
      changed_lines: changedLines,
    },
    findings,
    status: hasError ? "fail" : "pass",
  };
}

export function changedSnapshotFiles(
  before: TreeSnapshot,
  after: TreeSnapshot,
): string[] {
  const changed = new Set<string>();
  for (const [file, entry] of Object.entries(after)) {
    if (before[file]?.hash !== entry.hash) changed.add(file);
  }
  for (const file of Object.keys(before)) {
    if (!(file in after)) changed.add(file);
  }
  return [...changed].sort();
}

export function formatDiffReport(report: DiffReport): string {
  const lines: string[] = [];
  lines.push(`# Diff audit: ${report.status}`);
  lines.push("");
  lines.push(`- Base: \`${report.base}\``);
  lines.push(`- Target: \`${report.target}\``);
  lines.push(
    `- Changed: ${report.summary.changed_files} file(s) (${report.summary.added} added, ${report.summary.modified} modified, ${report.summary.deleted} deleted)`,
  );
  lines.push(`- Approx. changed lines: ${report.summary.changed_lines}`);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  if (report.files.length === 0) {
    lines.push("_No changes._");
  } else {
    for (const file of report.files) {
      lines.push(`- ${file.status}: \`${file.path}\``);
    }
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("_None._");
  } else {
    for (const item of report.findings) {
      const location = item.file ? ` (${item.file})` : "";
      lines.push(
        `- [${item.severity}] ${item.category}/${item.id}: ${item.message}${location}`,
      );
      if (item.detail) lines.push(`  - ${item.detail}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function writeDiffArtifacts(report: DiffReport, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "DIFF_AUDIT.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "DIFF_AUDIT.md"),
    formatDiffReport(report),
    "utf-8",
  );
}
