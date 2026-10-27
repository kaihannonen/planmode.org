import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  CheckDefinition,
  CheckMatch,
  CheckResult,
  CheckSeverity,
  CheckStatus,
} from "./types.js";
import { formatPath, globToRegExp, walkFiles } from "./glob.js";

export interface RunSingleCheckOptions {
  targetDir: string;
  changedFiles?: Set<string>;
  skipCommands?: boolean;
}

function severityOf(def: CheckDefinition): CheckSeverity {
  return def.severity ?? "error";
}

function result(
  def: CheckDefinition,
  status: CheckStatus,
  detail: string,
  extra: Partial<CheckResult> = {},
): CheckResult {
  return {
    name: def.name,
    kind: def.kind,
    severity: severityOf(def),
    status,
    detail,
    duration_ms: 0,
    ...extra,
  };
}

function collectGrepFiles(
  targetDir: string,
  def: CheckDefinition,
): { base: string; files: string[]; globbed: boolean } | null {
  if (!def.path) return null;
  const base = path.resolve(targetDir, def.path);
  if (!fs.existsSync(base)) return null;

  const stat = fs.statSync(base);
  let files = stat.isDirectory() ? walkFiles(base) : [base];
  const globbed = Boolean(def.glob);
  if (def.glob) {
    const matcher = globToRegExp(def.glob);
    files = files.filter((file) =>
      matcher.test(formatPath(path.relative(base, file))),
    );
  }
  return { base, files, globbed };
}

function runGrep(
  def: CheckDefinition,
  options: RunSingleCheckOptions,
): CheckResult {
  const started = Date.now();
  const collected = collectGrepFiles(options.targetDir, def);
  if (!collected) {
    return result(def, "fail", `path not found: ${def.path ?? "(missing path)"}`, {
      duration_ms: Date.now() - started,
    });
  }

  const { base, files } = collected;
  const totalBeforeChangeFilter = files.length;
  // grep-present is a presence invariant: it must scan the whole project so a
  // change that removes the last match is caught. grep-absent is scoped to
  // changed files so legacy violations do not block a change.
  const changed =
    def.kind === "grep-absent" ? options.changedFiles : undefined;
  const candidates = changed
    ? files.filter((file) =>
        changed.has(formatPath(path.relative(options.targetDir, file))),
      )
    : files;

  const where = def.glob ? `${def.path}/${def.glob}` : (def.path ?? ".");

  // A check whose scope matches zero files is almost always a broken check,
  // not a pass. This is the main defence against a vacuous guard.
  if (totalBeforeChangeFilter === 0 && def.allow_empty !== true) {
    return result(def, "fail", `no files matched ${where}`, {
      duration_ms: Date.now() - started,
      match_count: 0,
    });
  }

  if (changed && candidates.length === 0) {
    const detail =
      totalBeforeChangeFilter === 0
        ? `no files matched ${where}`
        : `no changed files matched ${where}`;
    if (def.kind === "grep-absent") {
      return result(def, "pass", detail, {
        duration_ms: Date.now() - started,
        match_count: 0,
      });
    }
    return result(def, "skipped", detail, {
      duration_ms: Date.now() - started,
      match_count: 0,
    });
  }

  let matcher: RegExp;
  try {
    matcher = new RegExp(def.pattern ?? "");
  } catch (err) {
    return result(def, "error", `invalid pattern: ${(err as Error).message}`, {
      duration_ms: Date.now() - started,
    });
  }

  const matches: CheckMatch[] = [];
  let matchCount = 0;
  for (const file of candidates) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!matcher.test(lines[index]!)) continue;
      matchCount++;
      if (matches.length < 5) {
        matches.push({
          file: formatPath(path.relative(options.targetDir, file)),
          line: index + 1,
          text: lines[index]!.trim().slice(0, 160),
        });
      }
    }
  }

  const min = def.min ?? 1;
  if (
    def.kind === "grep-present" &&
    (!Number.isInteger(min) || min < 1)
  ) {
    return result(def, "error", "grep-present min must be a positive integer", {
      duration_ms: Date.now() - started,
    });
  }
  const passed =
    def.kind === "grep-absent"
      ? matchCount === 0
      : matchCount >= min || (def.allow_empty === true && candidates.length === 0);

  const detail =
    def.kind === "grep-absent"
      ? matchCount === 0
        ? `no matches in ${where}`
        : `${matchCount} match(es) in ${where}`
      : matchCount >= min
        ? `${matchCount} match(es) in ${where}`
        : `found ${matchCount}, expected at least ${min} in ${where}`;

  return result(def, passed ? "pass" : "fail", detail, {
    duration_ms: Date.now() - started,
    matches,
    match_count: matchCount,
  });
}

export function runCommandCheck(
  def: CheckDefinition,
  targetDir: string,
  timeoutMs = 120_000,
): CheckResult {
  const started = Date.now();
  if (!def.run) {
    return result(def, "error", "command check has no run field", {
      duration_ms: Date.now() - started,
    });
  }

  const proc = spawnSync(def.run, {
    cwd: targetDir,
    shell: true,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });

  const stderr = (proc.stderr ?? "").trim();
  const stdout = (proc.stdout ?? "").trim();
  const output = (stderr || stdout).split("\n").slice(-20).join("\n").slice(0, 8000);
  const code = proc.status;
  const errorCode = (proc.error as NodeJS.ErrnoException | undefined)?.code;

  if (errorCode === "ETIMEDOUT" || proc.signal === "SIGTERM") {
    return result(def, "fail", `timed out after ${timeoutMs}ms`, {
      duration_ms: Date.now() - started,
      exit_code: code,
      output,
    });
  }

  if (errorCode === "ENOENT" || code === 127 || /command not found/i.test(stderr)) {
    return result(def, "skipped", `command not available: ${def.run}`, {
      duration_ms: Date.now() - started,
      exit_code: code,
      output,
    });
  }

  if (code === 0) {
    return result(def, "pass", def.run, {
      duration_ms: Date.now() - started,
      exit_code: 0,
      output: output || undefined,
    });
  }

  return result(def, "fail", `exit ${code}`, {
    duration_ms: Date.now() - started,
    exit_code: code,
    output,
  });
}

export function runSingleCheck(
  def: CheckDefinition,
  options: RunSingleCheckOptions,
): CheckResult {
  const started = Date.now();

  if (def.kind === "path-exists") {
    if (!def.path) {
      return result(def, "error", "path-exists check has no path field", {
        duration_ms: Date.now() - started,
      });
    }
    const exists = fs.existsSync(path.resolve(options.targetDir, def.path));
    return result(def, exists ? "pass" : "fail", exists ? def.path : `missing: ${def.path}`, {
      duration_ms: Date.now() - started,
    });
  }

  if (def.kind === "grep-present" || def.kind === "grep-absent") {
    return runGrep(def, options);
  }

  if (def.kind === "command") {
    if (options.skipCommands) {
      return result(def, "skipped", "command checks disabled", {
        duration_ms: Date.now() - started,
      });
    }
    return runCommandCheck(def, options.targetDir, (def.timeout ?? 120) * 1000);
  }

  return result(def, "error", `unknown check kind: ${(def as CheckDefinition).kind}`, {
    duration_ms: Date.now() - started,
  });
}
