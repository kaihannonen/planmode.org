import fs from "node:fs";
import path from "node:path";
import type { CheckReport } from "../checks/types.js";
import { formatDiffReport } from "./diff.js";
import type {
  AcceptanceResult,
  DiffFinding,
  DiffReport,
  JudgeReport,
  LoadedContract,
  SemanticReview,
} from "./types.js";

export interface BuildJudgeOptions {
  check: CheckReport;
  diff: DiffReport;
  contract?: LoadedContract;
  planHash?: string;
  planFile?: string;
  semantic?: SemanticReview;
  allowUnverified?: boolean;
}

function semanticFindings(review: SemanticReview): DiffFinding[] {
  return review.findings.map((item, index) => ({
    id: `semantic:${index + 1}`,
    severity: item.severity,
    category: "judge" as const,
    message: item.message,
    file: item.file,
  }));
}

export function buildJudgeReport(options: BuildJudgeOptions): JudgeReport {
  const findings: DiffFinding[] = [
    ...options.diff.findings,
    ...(options.semantic ? semanticFindings(options.semantic) : []),
  ];

  const acceptance: AcceptanceResult[] = (
    options.contract?.contract.acceptance ?? []
  ).map((item) => {
    if (!item.check) {
      return {
        criterion: item.criterion,
        status: "unmapped" as const,
      };
    }
    const result =
      options.check.results.find((check) => check.name === item.check) ??
      options.check.results.find(
        (check) => check.name === `command:${item.check}`,
      );
    if (!result) {
      return {
        criterion: item.criterion,
        check: item.check,
        status: "missing" as const,
        detail: `No check named ${item.check} ran.`,
      };
    }
    if (result.status === "pass") {
      return {
        criterion: item.criterion,
        check: item.check,
        status: "pass" as const,
      };
    }
    return {
      criterion: item.criterion,
      check: item.check,
      status: "fail" as const,
      detail: `${item.check}: ${result.status} — ${result.detail}`,
    };
  });
  const acceptanceFailure = acceptance.find(
    (item) => item.status === "fail" || item.status === "missing",
  );

  let status: JudgeReport["status"] = "pass";
  let reason = "All deterministic checks and the diff audit passed.";

  if (options.diff.status === "fail") {
    const errors = options.diff.findings.filter(
      (item) => item.severity === "error",
    ).length;
    status = "fail";
    reason = `Diff audit failed with ${errors} error(s).`;
  } else if (acceptanceFailure) {
    status = "fail";
    reason = `Contract acceptance criterion failed: ${acceptanceFailure.criterion}${acceptanceFailure.detail ? ` (${acceptanceFailure.detail})` : ""}`;
  } else if (options.check.new_failures.length > 0 || options.check.errors > 0) {
    const failures = [
      ...options.check.new_failures,
      ...options.check.results
        .filter((result) => result.status === "error")
        .map((result) => result.name),
    ];
    status = "fail";
    reason = `New check failures: ${[...new Set(failures)].join(", ")}`;
  } else if (
    options.check.not_verified.length > 0 &&
    !options.allowUnverified
  ) {
    status = "inconclusive";
    reason = `Checks were not fully verified: ${options.check.not_verified.join("; ")}`;
  } else if (options.semantic) {
    if (options.semantic.status === "fail") {
      status = "needs_human";
      reason =
        "The semantic reviewer rejected the change. Review its findings and decide.";
    } else if (options.semantic.status === "needs_human") {
      status = "needs_human";
      reason = `The semantic reviewer requested a human: ${options.semantic.summary}`;
    } else if (options.semantic.status === "inconclusive") {
      status = "inconclusive";
      reason = `The semantic reviewer was inconclusive: ${options.semantic.summary}`;
    } else {
      reason =
        "All deterministic checks, the diff audit, and the semantic review passed.";
    }
  }

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    status,
    reason,
    contract: options.contract
      ? {
          hash: options.contract.hash,
          file: options.contract.file,
          source: options.contract.source,
          contract: options.contract.contract,
        }
      : undefined,
    plan: options.planHash
      ? { hash: options.planHash, file: options.planFile }
      : undefined,
    acceptance,
    check: {
      passed: options.check.passed,
      failed: options.check.failed,
      errors: options.check.errors,
      flaky: options.check.flaky,
      new_failures: options.check.new_failures,
      not_verified: options.check.not_verified,
    },
    diff: options.diff,
    semantic: options.semantic,
    findings,
    report: options.check,
  };
}

export function formatJudgeReport(report: JudgeReport): string {
  const lines: string[] = [];
  lines.push(`# Judge: ${report.status}`);
  lines.push("");
  lines.push(report.reason);
  lines.push("");
  if (report.contract) {
    lines.push(`- Contract hash: \`${report.contract.hash}\``);
    if (report.contract.file) {
      lines.push(`- Contract file: \`${report.contract.file}\``);
    }
  }
  if (report.plan) {
    lines.push(`- Plan hash: \`${report.plan.hash}\``);
    if (report.plan.file) lines.push(`- Plan file: \`${report.plan.file}\``);
  }
  if (report.acceptance.length > 0) {
    lines.push("");
    lines.push("## Acceptance criteria");
    lines.push("");
    for (const item of report.acceptance) {
      lines.push(
        `- ${item.status}: ${item.criterion}${item.check ? ` (\`${item.check}\`)` : ""}${item.detail ? ` — ${item.detail}` : ""}`,
      );
    }
  }
  if (report.check) {
    lines.push(
      `- Checks: ${report.check.passed} passed, ${report.check.failed} failed, ${report.check.errors} error(s)`,
    );
    if (report.check.new_failures.length > 0) {
      lines.push(`- New failures: ${report.check.new_failures.join(", ")}`);
    }
    if (report.check.flaky.length > 0) {
      lines.push(`- Flaky on rerun: ${report.check.flaky.join(", ")}`);
    }
    if (report.check.not_verified.length > 0) {
      lines.push(`- Not verified: ${report.check.not_verified.join("; ")}`);
    }
  }
  lines.push(
    `- Diff: ${report.diff.summary.changed_files} file(s), ${report.diff.summary.changed_lines} changed line(s)`,
  );
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
  if (report.semantic) {
    lines.push("## Semantic review");
    lines.push("");
    lines.push(`- Status: ${report.semantic.status}`);
    lines.push(`- Command: \`${report.semantic.command}\``);
    lines.push(`- Summary: ${report.semantic.summary}`);
    for (const item of report.semantic.findings) {
      lines.push(
        `- [${item.severity}] ${item.message}${item.file ? ` (${item.file})` : ""}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function writeJudgeArtifacts(report: JudgeReport, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "JUDGE.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "JUDGE.md"),
    formatJudgeReport(report),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "DIFF_AUDIT.json"),
    `${JSON.stringify(report.diff, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "DIFF_AUDIT.md"),
    formatDiffReport(report.diff),
    "utf-8",
  );
}

export function writeSemanticArtifact(
  review: SemanticReview,
  dir: string,
): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SEMANTIC_REVIEW.json"),
    `${JSON.stringify(review, null, 2)}\n`,
    "utf-8",
  );
}
