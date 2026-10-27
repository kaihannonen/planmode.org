#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  formatPath,
  globToRegExp,
  loadManifest,
  walkFiles,
} from "./lib/harness.mjs";

function parseArgs(argv) {
  const args = { skipCommands: false, json: false, report: null, harness: null, target: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--skip-commands") args.skipCommands = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--harness") args.harness = argv[++i];
    else if (arg === "--target") args.target = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

const HELP = `Usage: node prototypes/run-evals.mjs --harness <dir> --target <dir> [options]

Options:
  --skip-commands   Do not run verification.commands
  --json            Print the report as JSON
  --report <file>   Write the JSON report to a file
  -h, --help        Show this help
`;

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (text) => paint("32", text);
const red = (text) => paint("31", text);
const yellow = (text) => paint("33", text);
const dim = (text) => paint("2", text);
const bold = (text) => paint("1", text);

function relativeTo(base, file) {
  return formatPath(path.relative(base, file));
}

function collectFiles(target, evalPath, glob) {
  const base = path.resolve(target, evalPath);
  if (!fs.existsSync(base)) return { base, files: null };
  const stat = fs.statSync(base);
  let files = stat.isDirectory() ? walkFiles(base) : [base];
  if (glob) {
    const matcher = globToRegExp(glob);
    files = files.filter((file) => matcher.test(relativeTo(base, file)));
  }
  return { base, files };
}

function runGrep(evalDef, target) {
  const { base, files } = collectFiles(target, evalDef.path, evalDef.glob);
  if (files === null) return { status: "missing", matches: [], base };
  const matcher = new RegExp(evalDef.pattern);
  const matches = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (matcher.test(lines[index])) {
        matches.push({
          file: relativeTo(target, file),
          line: index + 1,
          text: lines[index].trim().slice(0, 160),
        });
      }
    }
  }
  return { status: "ok", matches, base, fileCount: files.length };
}

function runCommand(evalDef, target) {
  const result = spawnSync(evalDef.run, {
    cwd: target,
    shell: true,
    encoding: "utf8",
    timeout: evalDef.timeout ?? 120_000,
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  const code = result.status;
  const stderr = (result.stderr ?? "").trim();
  const stdout = (result.stdout ?? "").trim();
  if (code === 0) return { status: "pass", code };
  if (code === 127 || /command not found/i.test(stderr)) {
    return { status: "unavailable", code, output: stderr.split("\n").slice(-1)[0] };
  }
  return {
    status: "fail",
    code,
    output: (stderr || stdout).split("\n").slice(-6).join("\n"),
  };
}

function evaluate(evalDef, target) {
  const severity = evalDef.severity ?? "error";
  const base = { name: evalDef.name, kind: evalDef.kind, severity };

  if (evalDef.kind === "path-exists") {
    const exists = fs.existsSync(path.resolve(target, evalDef.path));
    return {
      ...base,
      status: exists ? "pass" : "fail",
      detail: exists ? evalDef.path : `missing: ${evalDef.path}`,
    };
  }

  if (evalDef.kind === "grep-present" || evalDef.kind === "grep-absent") {
    const result = runGrep(evalDef, target);
    if (result.status === "missing") {
      return { ...base, status: "fail", detail: `path not found: ${evalDef.path}` };
    }
    const count = result.matches.length;
    const min = evalDef.min ?? 1;
    const passed =
      evalDef.kind === "grep-absent" ? count === 0 : count >= min;
    const detail =
      evalDef.kind === "grep-absent"
        ? count === 0
          ? "no matches"
          : `${count} match(es)`
        : count >= min
          ? `${count} match(es)`
          : `found ${count}, expected at least ${min}`;
    const where = evalDef.glob ? `${evalDef.path}/${evalDef.glob}` : evalDef.path;
    const noFiles = result.fileCount === 0 ? " — no files matched" : "";
    return {
      ...base,
      status: passed ? "pass" : "fail",
      detail: `${detail} in ${where}${noFiles}`,
      matches: result.matches.slice(0, 5),
      matchCount: count,
    };
  }

  if (evalDef.kind === "command") {
    const result = runCommand(evalDef, target);
    return {
      ...base,
      status: result.status === "pass" ? "pass" : result.status === "unavailable" ? "skipped" : "fail",
      detail:
        result.status === "pass"
          ? evalDef.run
          : result.status === "unavailable"
            ? `command not available: ${evalDef.run}`
            : `exit ${result.code}`,
      output: result.output,
    };
  }

  return { ...base, status: "fail", detail: `unknown kind: ${evalDef.kind}` };
}

function weightOf(severity) {
  return severity === "warn" ? 0.5 : 1;
}

function summarize(results) {
  const counted = results.filter((item) => item.status !== "skipped");
  const total = counted.reduce((sum, item) => sum + weightOf(item.severity), 0);
  const earned = counted
    .filter((item) => item.status === "pass")
    .reduce((sum, item) => sum + weightOf(item.severity), 0);
  const score = total === 0 ? 100 : Math.round((earned / total) * 100);
  return {
    score,
    passed: results.filter((item) => item.status === "pass").length,
    failed: results.filter((item) => item.status === "fail").length,
    skipped: results.filter((item) => item.status === "skipped").length,
  };
}

function printHuman(report) {
  const symbol = { pass: green("✓"), fail: red("✗"), skipped: yellow("·") };
  console.log("");
  console.log(bold(`${report.harness} @ ${report.target}`));
  console.log("");
  for (const result of report.results) {
    const tag = result.severity === "warn" ? dim(" (warn)") : "";
    console.log(`  ${symbol[result.status]} ${result.name}${tag}`);
    if (result.detail && result.status !== "pass") {
      console.log(`      ${dim(result.detail)}`);
    }
    for (const match of result.matches ?? []) {
      console.log(`      ${dim(`${match.file}:${match.line}`)}  ${match.text}`);
    }
    if (result.output) {
      for (const line of result.output.split("\n")) {
        console.log(`      ${dim(line)}`);
      }
    }
  }
  const { score, passed, failed, skipped } = report;
  console.log("");
  console.log(
    `  ${bold(`score ${score}/100`)} · ${passed} passed · ${failed} failed` +
      (skipped > 0 ? ` · ${skipped} skipped` : ""),
  );
  console.log("");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.harness || !args.target) {
    console.error(HELP);
    process.exit(2);
  }

  const harnessDir = path.resolve(args.harness);
  const target = path.resolve(args.target);
  if (!fs.existsSync(target)) throw new Error(`target does not exist: ${target}`);

  const { manifest } = loadManifest(harnessDir);
  const results = [];

  for (const evalDef of manifest.evals ?? []) {
    results.push(evaluate(evalDef, target));
  }

  if (!args.skipCommands) {
    for (const command of manifest.verification?.commands ?? []) {
      results.push(
        evaluate(
          { name: `command:${command.name}`, kind: "command", run: command.run },
          target,
        ),
      );
    }
  }

  const summary = summarize(results);
  const report = {
    harness: manifest.name,
    version: manifest.version,
    target: formatPath(path.relative(process.cwd(), target)) || ".",
    ...summary,
    results,
  };

  if (args.report) {
    fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);

  if (summary.failed > 0) process.exit(1);
}

main();
