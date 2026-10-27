import type { CheckReport } from "../checks/types.js";
import type { DiffReport, JudgeReport } from "../judge/types.js";

export type LoopStatus =
  | "passed"
  | "failed"
  | "stopped"
  | "inconclusive"
  | "needs_human";

export interface LoopOptions {
  sourceDir: string;
  workspace?: string;
  planPath?: string;
  contractPath?: string;
  harnessPath?: string;
  guardsPath?: string;
  agentCommand: string;
  agentName?: string;
  judgeAgent?: string;
  judgeTimeout?: number;
  maxIterations?: number;
  agentTimeout?: number;
  skipCommands?: boolean;
  rerunFailures?: boolean;
  allowUnverified?: boolean;
  linkDependencies?: boolean;
  reportDir?: string;
  protectedPaths?: string[];
  env?: Record<string, string>;
}

export interface LoopIteration {
  iteration: number;
  agentExitCode: number | null;
  agentTimedOut: boolean;
  report: CheckReport;
  diffAudit: DiffReport;
  judge: JudgeReport;
  failureSignature: string;
  newFailures: string[];
  regressions: string[];
  protectedChanges: string[];
  promptFile: string;
  failureFile?: string;
  agentLog: string;
  durationMs: number;
}

export interface LoopResult {
  status: LoopStatus;
  reason: string;
  workspace: string;
  stateDir: string;
  planFile?: string;
  planHash?: string;
  contractHash?: string;
  contractFile?: string;
  iterations: LoopIteration[];
  finalReport?: CheckReport;
  judge?: JudgeReport;
  guardsFile?: string;
}
