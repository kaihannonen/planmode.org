export type CheckKind = "path-exists" | "grep-present" | "grep-absent" | "command";
export type CheckSeverity = "error" | "warn";
export type CheckStatus = "pass" | "fail" | "skipped" | "error";

export interface CheckMatch {
  file: string;
  line: number;
  text: string;
}

export interface CheckDefinition {
  name: string;
  kind: CheckKind;
  severity?: CheckSeverity;
  path?: string;
  glob?: string;
  pattern?: string;
  min?: number;
  run?: string;
  timeout?: number;
  hint?: string;
  allow_empty?: boolean;
  /** Set when this check came from a permanent bug guard. */
  guard?: string;
}

export interface HarnessVerificationCommand {
  name: string;
  run: string;
  timeout?: number;
}

export interface HarnessManifest {
  name?: string;
  version?: string;
  evals?: CheckDefinition[];
  verification?: {
    commands?: HarnessVerificationCommand[];
  };
}

export interface GuardFixture {
  bad?: string;
  good?: string;
}

export interface GuardDefinition {
  id: string;
  reason: string;
  source?: string;
  created_at: string;
  severity?: CheckSeverity;
  check: Omit<CheckDefinition, "name" | "severity" | "guard">;
  fixtures?: GuardFixture;
  verified?: boolean;
}

export interface GuardsFile {
  version: number;
  guards: GuardDefinition[];
}

export interface CheckResult {
  name: string;
  kind: CheckKind;
  severity: CheckSeverity;
  status: CheckStatus;
  detail: string;
  hint?: string;
  guard?: string;
  duration_ms: number;
  matches?: CheckMatch[];
  match_count?: number;
  output?: string;
  exit_code?: number | null;
  /** The definition that produced this result. Included for failed checks. */
  definition?: CheckDefinition;
}

export interface CheckReport {
  version: 1;
  harness: string;
  harness_version?: string;
  target: string;
  mode: "full" | "changed";
  base?: string;
  baseline?: string;
  agent?: {
    id?: string;
    model?: string;
  };
  environment: Record<string, string>;
  started_at: string;
  duration_ms: number;
  score: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  changed_files: string[];
  results: CheckResult[];
  fixed: string[];
  new_failures: string[];
  definition_changes: string[];
  not_verified: string[];
  suggested_guards: GuardDefinition[];
}

export interface BaselineFile {
  version: 1;
  created_at: string;
  harness?: string;
  files: Record<string, string>;
  results: Record<string, CheckStatus>;
  /** Hashes of the check definitions used to produce `results`. */
  definitions?: Record<string, string>;
}
