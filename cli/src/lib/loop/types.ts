import type { CheckReport } from "../checks/types.js";

export type LoopStatus = "passed" | "failed" | "stopped" | "inconclusive";

export interface LoopOptions {
  sourceDir: string;
  workspace?: string;
  planPath?: string;
  harnessPath?: string;
  guardsPath?: string;
  agentCommand: string;
  agentName?: string;
  maxIterations?: number;
  agentTimeout?: number;
  skipCommands?: boolean;
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
  iterations: LoopIteration[];
  finalReport?: CheckReport;
  guardsFile?: string;
}
