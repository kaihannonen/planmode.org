import { readLockfileStrict } from "./lockfile.js";
import { runDoctor, type DiagnosticIssue } from "./doctor.js";
import type { Lockfile } from "../types/index.js";

export interface CiIssue extends DiagnosticIssue {
  code: "lockfile" | "missing" | "hash" | "import" | "target" | "orphan" | "other";
}

export interface CiResult {
  packagesChecked: number;
  issues: CiIssue[];
  passed: boolean;
  strict: boolean;
}

export interface CiOptions {
  projectDir?: string;
  strict?: boolean;
}

function issueCode(message: string): CiIssue["code"] {
  if (message.includes("Missing file")) return "missing";
  if (message.includes("Content hash mismatch")) return "hash";
  if (message.includes("CLAUDE.md")) return "import";
  if (message.includes("AGENTS.md") || message.includes("Cursor rule")) return "target";
  if (message.includes("Untracked")) return "orphan";
  return "other";
}

export function runCi(options: CiOptions = {}): CiResult {
  const projectDir = options.projectDir ?? process.cwd();
  const strict = options.strict ?? false;

  let lockfile: Lockfile;
  try {
    lockfile = readLockfileStrict(projectDir);
  } catch (err) {
    return {
      packagesChecked: 0,
      issues: [
        {
          severity: "error",
          code: "lockfile",
          message: (err as Error).message,
          fix: "Commit planmode.lock, or run `planmode install <package>` to create it.",
        },
      ],
      passed: false,
      strict,
    };
  }

  const doctor = runDoctor(projectDir);
  const issues: CiIssue[] = doctor.issues.map((issue) => {
    // Doctor treats local edits as warnings. In CI, a hash mismatch means the
    // generated files no longer match the lockfile, so fail the build.
    const severity = issue.message.startsWith("Content hash mismatch")
      ? "error"
      : issue.severity;

    return {
      ...issue,
      severity,
      code: issueCode(issue.message),
    };
  });

  if (Object.keys(lockfile.packages).length === 0) {
    issues.push({
      severity: "warning",
      code: "lockfile",
      message: "No packages are locked in planmode.lock.",
      fix: "Run `planmode install <package>` and commit the result.",
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  const passed = strict ? issues.length === 0 : !hasErrors;

  return {
    packagesChecked: Object.keys(lockfile.packages).length,
    issues,
    passed,
    strict,
  };
}
