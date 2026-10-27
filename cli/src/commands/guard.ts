import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import type {
  CheckDefinition,
  CheckKind,
  CheckReport,
  CheckSeverity,
  GuardDefinition,
} from "../lib/checks/types.js";
import {
  addGuard,
  guardsToYaml,
  makeGuardId,
  suggestionsFromReport,
  verifyGuard,
} from "../lib/checks/guards.js";
import {
  guardFilePath,
  readGuards,
  readGuardsFile,
} from "../lib/checks/config.js";
import { logger } from "../lib/logger.js";

interface GuardAddOptions {
  project?: string;
  guards?: string;
  from?: string;
  id?: string;
  reason?: string;
  source?: string;
  kind?: CheckKind;
  path?: string;
  glob?: string;
  pattern?: string;
  min?: string;
  run?: string;
  timeout?: string;
  bad?: string;
  good?: string;
  severity?: CheckSeverity;
  force?: boolean;
}

function buildCheck(options: GuardAddOptions): Omit<
  CheckDefinition,
  "name" | "severity" | "guard"
> {
  if (!options.kind) {
    throw new Error("--kind is required: path-exists, grep-present, grep-absent, or command");
  }
  const kinds: CheckKind[] = [
    "path-exists",
    "grep-present",
    "grep-absent",
    "command",
  ];
  if (!kinds.includes(options.kind)) {
    throw new Error(`Unknown check kind: ${options.kind}`);
  }

  const min = options.min ? Number(options.min) : undefined;
  if (min !== undefined && (!Number.isInteger(min) || min < 1)) {
    throw new Error("--min must be a positive integer");
  }
  const timeout = options.timeout ? Number(options.timeout) : undefined;
  if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
    throw new Error("--timeout must be a positive number of seconds");
  }

  const check: Omit<CheckDefinition, "name" | "severity" | "guard"> = {
    kind: options.kind,
    path: options.path,
    glob: options.glob,
    pattern: options.pattern,
    run: options.run,
    min,
    timeout,
  };

  if (check.kind === "path-exists" && !check.path) {
    throw new Error("path-exists guards need --path");
  }
  if (
    (check.kind === "grep-present" || check.kind === "grep-absent") &&
    (!check.path || !check.pattern)
  ) {
    throw new Error("grep guards need --path and --pattern");
  }
  if (check.kind === "command" && !check.run) {
    throw new Error("command guards need --run");
  }
  return check;
}

function guardFromOptions(options: GuardAddOptions): GuardDefinition {
  const check = buildCheck(options);
  const severity = options.severity ?? "error";
  if (severity !== "error" && severity !== "warn") {
    throw new Error("--severity must be error or warn");
  }
  const id =
    options.id ??
    makeGuardId(options.reason ?? `${check.kind}-${check.path ?? check.run ?? "check"}`);
  return {
    id,
    reason:
      options.reason ??
      `Prevent regression: ${check.kind} ${check.path ?? check.run ?? ""}`.trim(),
    source: options.source ?? "manual",
    created_at: new Date().toISOString(),
    severity,
    check,
    fixtures:
      options.bad || options.good
        ? { bad: options.bad, good: options.good }
        : undefined,
    verified: false,
  };
}

function guardFromProposedFile(
  file: string,
  id: string | undefined,
  options: GuardAddOptions,
): GuardDefinition {
  const data = readGuardsFile(path.resolve(file));
  if (data.guards.length === 0) {
    throw new Error(`No guards found in ${file}`);
  }

  let guard: GuardDefinition | undefined;
  if (id) {
    guard = data.guards.find((item) => item.id === id);
    if (!guard) throw new Error(`Guard "${id}" not found in ${file}`);
  } else if (data.guards.length === 1) {
    guard = data.guards[0];
  } else {
    throw new Error(
      `Multiple guards in ${file}; pass --id to choose one: ${data.guards.map((item) => item.id).join(", ")}`,
    );
  }

  return {
    ...guard,
    fixtures:
      options.bad || options.good
        ? { bad: options.bad, good: options.good }
        : guard.fixtures,
    reason: options.reason ?? guard.reason,
    source: options.source ?? guard.source,
    severity: options.severity ?? guard.severity,
  };
}

const addCommand = new Command("add")
  .description("Add a deterministic regression guard and prove it discriminates")
  .option("--project <dir>", "Project directory", ".")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .option("--from <file>", "Import a proposed guard from a YAML file")
  .option("--id <id>", "Guard id")
  .option("--reason <reason>", "Why this guard exists")
  .option("--source <source>", "Bug id, issue URL, or check run")
  .option("--kind <kind>", "path-exists, grep-present, grep-absent, command")
  .option("--path <path>", "Path or directory for the check")
  .option("--glob <glob>", "Glob relative to --path")
  .option("--pattern <regex>", "Regex for grep checks")
  .option("--min <n>", "Minimum matches for grep-present")
  .option("--run <command>", "Command for command checks")
  .option("--timeout <seconds>", "Command timeout in seconds")
  .option("--bad <dir>", "Fixture where the guard must fail")
  .option("--good <dir>", "Fixture where the guard must pass")
  .option("--severity <severity>", "error or warn", "error")
  .option("--force", "Add even if no fixtures prove it discriminates")
  .action((options: GuardAddOptions) => {
    try {
      const projectDir = path.resolve(options.project ?? ".");
      const guard = options.from
        ? guardFromProposedFile(options.from, options.id, options)
        : guardFromOptions(options);

      const { file, verification } = addGuard({
        targetDir: projectDir,
        guardsPath: options.guards,
        guard,
        force: options.force,
      });

      if (verification?.verified) {
        logger.success(
          `Guard "${guard.id}" verified: bad fixture fails, good fixture passes`,
        );
      } else if (verification) {
        logger.warn(`Guard "${guard.id}" added unverified:`);
        for (const issue of verification.issues) logger.dim(`  - ${issue}`);
      } else {
        logger.success(`Guard "${guard.id}" added`);
      }
      logger.dim(`Wrote ${path.relative(process.cwd(), file) || file}`);
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });

const verifyCommand = new Command("verify")
  .description("Prove every guard still fails on its bad fixture and passes its good fixture")
  .option("--project <dir>", "Project directory", ".")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .option("--allow-unverified", "Do not fail for guards without fixtures")
  .action((options: { project?: string; guards?: string; allowUnverified?: boolean }) => {
    try {
      const projectDir = path.resolve(options.project ?? ".");
      const data = readGuards(projectDir, options.guards);
      if (data.guards.length === 0) {
        logger.warn("No guards found.");
        return;
      }

      let invalid = 0;
      for (const guard of data.guards) {
        const verification = verifyGuard(guard, projectDir);
        if (verification.verified) {
          logger.success(`${guard.id}: verified`);
          continue;
        }
        if (options.allowUnverified && !guard.fixtures?.bad && !guard.fixtures?.good) {
          logger.warn(`${guard.id}: no fixtures (allowed)`);
          continue;
        }
        invalid++;
        logger.error(`${guard.id}: not verified`);
        for (const issue of verification.issues) logger.dim(`  - ${issue}`);
      }

      if (invalid > 0) process.exitCode = 1;
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });

const listCommand = new Command("list")
  .description("List guards")
  .option("--project <dir>", "Project directory", ".")
  .option("--guards <file>", "Guards file (default: .planmode/guards.yaml)")
  .action((options: { project?: string; guards?: string }) => {
    try {
      const projectDir = path.resolve(options.project ?? ".");
      const file = guardFilePath(projectDir, options.guards);
      const data = readGuards(projectDir, options.guards);
      if (data.guards.length === 0) {
        logger.info(`No guards in ${path.relative(process.cwd(), file) || file}`);
        return;
      }
      logger.table(
        ["id", "kind", "severity", "verified", "reason"],
        data.guards.map((guard) => [
          guard.id,
          guard.check.kind,
          guard.severity ?? "error",
          guard.verified ? "yes" : "no",
          guard.reason,
        ]),
      );
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });

const proposeCommand = new Command("propose")
  .description("Turn failed checks in a report into proposed guards")
  .requiredOption("--report <file>", "report.json from planmode check")
  .option("--out <file>", "Output YAML", ".planmode/guards.proposed.yaml")
  .action((options: { report: string; out: string }) => {
    try {
      const report = JSON.parse(
        fs.readFileSync(path.resolve(options.report), "utf-8"),
      ) as CheckReport;
      const guards = suggestionsFromReport(report);
      if (guards.length === 0) {
        logger.info("No failed checks to turn into guards.");
        return;
      }
      const out = path.resolve(options.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, guardsToYaml(guards), "utf-8");
      logger.success(`Wrote ${guards.length} proposed guard(s) to ${options.out}`);
      logger.dim("Add fixtures with: planmode guard add --from <file> --id <id> --bad <dir> --good <dir>");
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 1;
    }
  });

export const guardCommand = new Command("guard")
  .description("Manage deterministic regression guards")
  .addCommand(addCommand)
  .addCommand(verifyCommand)
  .addCommand(listCommand)
  .addCommand(proposeCommand);
