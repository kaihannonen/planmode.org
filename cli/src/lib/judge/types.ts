import type { CheckReport } from "../checks/types.js";

export interface AcceptanceCriterion {
  criterion: string;
  check?: string;
}

export interface Contract {
  version: 1;
  acceptance: AcceptanceCriterion[];
  allowed_paths: string[];
  protected_paths: string[];
  allow_test_edits: boolean;
  allow_dependency_changes: boolean;
  max_changed_files: number;
  max_changed_lines: number;
}

export interface LoadedContract {
  contract: Contract;
  hash: string;
  file?: string;
  source: "plan-frontmatter" | "contract-file";
}

export type DiffStatus = "added" | "modified" | "deleted";

export interface DiffFile {
  path: string;
  status: DiffStatus;
  before_hash?: string;
  after_hash?: string;
  lines_before?: number;
  lines_after?: number;
  binary?: boolean;
}

export type FindingSeverity = "error" | "warn";
export type FindingCategory =
  | "protected"
  | "scope"
  | "tests"
  | "dependencies"
  | "size"
  | "secret"
  | "quality"
  | "binary"
  | "no-change"
  | "judge";

export interface DiffFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  file?: string;
  detail?: string;
}

export interface DiffReport {
  version: 1;
  generated_at: string;
  base: string;
  target: string;
  files: DiffFile[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    changed_files: number;
    changed_lines: number;
  };
  findings: DiffFinding[];
  status: "pass" | "fail";
}

export type SemanticVerdict = "pass" | "fail" | "needs_human";

export interface SemanticFinding {
  severity: FindingSeverity;
  message: string;
  file?: string;
}

export interface SemanticReview {
  status: SemanticVerdict | "inconclusive";
  summary: string;
  findings: SemanticFinding[];
  command: string;
  duration_ms: number;
  output_file: string;
  raw?: string;
}

export type JudgeStatus = "pass" | "fail" | "needs_human" | "inconclusive";

export interface AcceptanceResult {
  criterion: string;
  check?: string;
  status: "pass" | "fail" | "missing" | "unmapped";
  detail?: string;
}

export interface JudgeReport {
  version: 1;
  generated_at: string;
  status: JudgeStatus;
  reason: string;
  contract?: {
    hash: string;
    file?: string;
    source: LoadedContract["source"];
    contract: Contract;
  };
  plan?: {
    hash: string;
    file?: string;
  };
  acceptance: AcceptanceResult[];
  check?: {
    passed: number;
    failed: number;
    errors: number;
    flaky: string[];
    new_failures: string[];
    not_verified: string[];
  };
  diff: DiffReport;
  semantic?: SemanticReview;
  findings: DiffFinding[];
  report?: CheckReport;
}
