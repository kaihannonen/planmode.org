#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listHarnesses, loadManifest } from "./lib/harness.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.join(ROOT, "harnesses");

const TARGETS = new Set(["claude", "codex", "cursor"]);
const CATEGORIES = new Set([
  "frontend",
  "backend",
  "devops",
  "database",
  "testing",
  "mobile",
  "ai-ml",
  "design",
  "security",
  "other",
]);
const EVAL_KINDS = new Set(["grep-present", "grep-absent", "path-exists", "command"]);
const SEVERITIES = new Set(["error", "warn"]);

const errors = [];
const warnings = [];

function error(where, message) {
  errors.push(`${where}: ${message}`);
}

function warn(where, message) {
  warnings.push(`${where}: ${message}`);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checkIncludes(where, dir, includes, key) {
  const entries = includes?.[key];
  if (!Array.isArray(entries) || entries.length === 0) {
    error(where, `includes.${key} must be a non-empty array`);
    return 0;
  }
  for (const rel of entries) {
    if (!isNonEmptyString(rel)) {
      error(where, `includes.${key} contains a non-string entry`);
      continue;
    }
    if (path.isAbsolute(rel)) {
      error(where, `includes.${key} must be relative: ${rel}`);
      continue;
    }
    const resolved = path.resolve(dir, rel);
    if (!fs.existsSync(resolved)) {
      error(where, `includes.${key} path does not exist: ${rel}`);
      continue;
    }
    const content = fs.readFileSync(resolved, "utf8").trim();
    if (content.length < 80) {
      warn(where, `includes.${key} file looks empty: ${rel}`);
    }
    if (!content.startsWith("#")) {
      warn(where, `includes.${key} file has no markdown heading: ${rel}`);
    }
  }
  return entries.length;
}

function checkEvals(where, evals) {
  if (!Array.isArray(evals) || evals.length === 0) {
    error(where, "evals must be a non-empty array");
    return 0;
  }
  const names = new Set();
  for (const [index, item] of evals.entries()) {
    const label = `${where} evals[${index}]`;
    if (!item || typeof item !== "object") {
      error(label, "must be an object");
      continue;
    }
    if (!isNonEmptyString(item.name)) error(label, "name is required");
    if (names.has(item.name)) error(label, `duplicate eval name: ${item.name}`);
    names.add(item.name);
    if (!EVAL_KINDS.has(item.kind)) {
      error(label, `unknown kind: ${item.kind}`);
      continue;
    }
    if (item.severity && !SEVERITIES.has(item.severity)) {
      error(label, `unknown severity: ${item.severity}`);
    }
    if (item.kind === "path-exists") {
      if (!isNonEmptyString(item.path)) error(label, "path is required");
    }
    if (item.kind === "grep-present" || item.kind === "grep-absent") {
      if (!isNonEmptyString(item.pattern)) error(label, "pattern is required");
      else {
        try {
          new RegExp(item.pattern);
        } catch (err) {
          error(label, `invalid regex: ${err.message}`);
        }
      }
      if (!isNonEmptyString(item.path)) error(label, "path is required");
      if (item.kind === "grep-present" && item.min !== undefined) {
        if (!Number.isInteger(item.min) || item.min < 1) {
          error(label, "min must be a positive integer");
        }
      }
    }
    if (item.kind === "command" && !isNonEmptyString(item.run)) {
      error(label, "run is required");
    }
  }
  return evals.length;
}

const harnessDirs = listHarnesses(HARNESS_ROOT);

for (const dir of harnessDirs) {
  const name = path.basename(dir);
  let manifest;
  try {
    ({ manifest } = loadManifest(dir));
  } catch (err) {
    error(name, err.message);
    continue;
  }

  for (const field of ["name", "version", "type", "description", "author", "license", "category"]) {
    if (!isNonEmptyString(manifest[field])) error(name, `${field} is required`);
  }
  if (manifest.name !== name) {
    error(name, `name "${manifest.name}" does not match directory "${name}"`);
  }
  if (manifest.type !== "harness") error(name, 'type must be "harness"');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
    error(name, `version must be semver, got "${manifest.version}"`);
  }
  if (!CATEGORIES.has(manifest.category)) {
    error(name, `unknown category: ${manifest.category}`);
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    error(name, "targets must be a non-empty array");
  } else {
    for (const target of manifest.targets) {
      if (!TARGETS.has(target)) error(name, `unknown target: ${target}`);
    }
  }

  const rules = checkIncludes(name, dir, manifest.includes, "rules");
  const plans = checkIncludes(name, dir, manifest.includes, "plans");

  const commands = manifest.verification?.commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    error(name, "verification.commands must be a non-empty array");
  } else {
    for (const [index, command] of commands.entries()) {
      if (!isNonEmptyString(command?.name)) error(name, `verification.commands[${index}] needs a name`);
      if (!isNonEmptyString(command?.run)) error(name, `verification.commands[${index}] needs a run`);
    }
  }

  const evals = checkEvals(name, manifest.evals);

  if (!Array.isArray(manifest.suggests?.mcp ?? [])) {
    error(name, "suggests.mcp must be an array when present");
  }

  console.log(
    `  ✓ ${name.padEnd(20)} ${rules} rules, ${plans} plans, ${evals} evals, ${commands?.length ?? 0} commands`,
  );
}

console.log("");
if (warnings.length > 0) {
  console.log(`${warnings.length} warning(s):`);
  for (const item of warnings) console.log(`  ! ${item}`);
  console.log("");
}
if (errors.length > 0) {
  console.log(`${errors.length} error(s):`);
  for (const item of errors) console.log(`  ✗ ${item}`);
  console.log("");
  console.log(`FAILED — ${harnessDirs.length} harnesses checked`);
  process.exit(1);
}
console.log(`OK — ${harnessDirs.length} harnesses, ${warnings.length} warnings`);
