import fs from "node:fs";
import path from "node:path";
import { exec, type ExecException } from "node:child_process";
import { promisify } from "node:util";
import type { PackageVerification, VerificationCommand } from "../types/index.js";
import { readManifest } from "./manifest.js";
import { readLockfile } from "./lockfile.js";

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_SECONDS = 300;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface VerificationCommandResult {
  name: string;
  run: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface VerificationResult {
  packageName: string;
  version?: string;
  commands: VerificationCommandResult[];
  passed: boolean;
}

export interface VerifyOptions {
  projectDir?: string;
  packageName?: string;
  defaultTimeout?: number;
  dryRun?: boolean;
}

interface VerificationTarget {
  packageName: string;
  version?: string;
  verification: PackageVerification;
}

function getVerificationTargets(
  projectDir: string,
  packageName?: string,
): VerificationTarget[] {
  const lockfile = readLockfile(projectDir);

  if (packageName) {
    const locked = lockfile.packages[packageName];
    if (locked) {
      if (!locked.verification?.commands?.length) {
        throw new Error(`Package '${packageName}' does not define verification commands.`);
      }
      return [{
        packageName,
        version: locked.version,
        verification: locked.verification,
      }];
    }

    const manifestPath = path.join(projectDir, "planmode.yaml");
    if (fs.existsSync(manifestPath)) {
      const manifest = readManifest(projectDir);
      if (manifest.name === packageName && manifest.verification?.commands?.length) {
        return [{
          packageName,
          version: manifest.version,
          verification: manifest.verification,
        }];
      }
    }

    throw new Error(`Package '${packageName}' is not installed and has no local verification commands.`);
  }

  // In a package authoring directory, verify the local manifest first.
  const manifestPath = path.join(projectDir, "planmode.yaml");
  if (fs.existsSync(manifestPath)) {
    const manifest = readManifest(projectDir);
    if (manifest.verification?.commands?.length) {
      return [{
        packageName: manifest.name,
        version: manifest.version,
        verification: manifest.verification,
      }];
    }
  }

  const targets = Object.entries(lockfile.packages)
    .filter(([, entry]) => entry.verification?.commands?.length)
    .map(([name, entry]) => ({
      packageName: name,
      version: entry.version,
      verification: entry.verification!,
    }));

  if (targets.length === 0) {
    throw new Error(
      "No verification commands found. Install a plan that defines `verification.commands` or run this in a package directory with planmode.yaml.",
    );
  }

  return targets;
}

async function runCommand(
  command: VerificationCommand,
  projectDir: string,
  defaultTimeout: number,
): Promise<VerificationCommandResult> {
  const timeoutSeconds = command.timeout ?? defaultTimeout;
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command.run, {
      cwd: projectDir,
      timeout: timeoutSeconds * 1000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
    });

    return {
      name: command.name,
      run: command.run,
      status: "passed",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      timedOut: false,
    };
  } catch (err) {
    const error = err as ExecException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };
    const timedOut = Boolean(error.killed) || error.signal === "SIGTERM";

    return {
      name: command.name,
      run: command.run,
      status: "failed",
      exitCode: typeof error.code === "number" ? error.code : null,
      durationMs: Date.now() - startedAt,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      timedOut,
    };
  }
}

export async function verifyPackages(options: VerifyOptions = {}): Promise<VerificationResult[]> {
  const projectDir = options.projectDir ?? process.cwd();
  const defaultTimeout = options.defaultTimeout ?? DEFAULT_TIMEOUT_SECONDS;
  const targets = getVerificationTargets(projectDir, options.packageName);

  const results: VerificationResult[] = [];

  for (const target of targets) {
    const commands: VerificationCommandResult[] = [];

    for (const command of target.verification.commands) {
      if (options.dryRun) {
        commands.push({
          name: command.name,
          run: command.run,
          status: "skipped",
          exitCode: null,
          durationMs: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
        });
      } else {
        commands.push(await runCommand(command, projectDir, defaultTimeout));
      }
    }

    results.push({
      packageName: target.packageName,
      version: target.version,
      commands,
      passed: commands.every((command) => command.status !== "failed"),
    });
  }

  return results;
}
