import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as p from "@clack/prompts";
import { handleCancel, withSpinner } from "../lib/prompts.js";
import { searchPackages, fetchPackageMetadata, fetchIndex } from "../lib/registry.js";
import { installPackage } from "../lib/installer.js";
import { readLockfile } from "../lib/lockfile.js";
import { runDoctor } from "../lib/doctor.js";
import type { PackageSummary } from "../types/index.js";

type Action =
  | "search"
  | "browse"
  | "install"
  | "create"
  | "list"
  | "doctor"
  | "exit";

type FirstRunAction =
  | "browse"
  | "search"
  | "create";

const CATEGORIES = [
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
] as const;

function isFirstRun(): boolean {
  const configPath = path.join(os.homedir(), ".planmode", "config");
  const hasConfig = fs.existsSync(configPath);
  const lockfile = readLockfile();
  const hasPackages = Object.keys(lockfile.packages).length > 0;
  return !hasConfig && !hasPackages;
}

export async function runInteractiveMenu(): Promise<void> {
  if (isFirstRun()) {
    await firstRunFlow();
  } else {
    await mainMenu();
  }
}

// ── First-run experience ──

async function firstRunFlow(): Promise<void> {
  p.intro("planmode");

  p.note(
    [
      "planmode installs AI plans, rules, and prompts into your project.",
      "Plans work with Claude Code automatically via CLAUDE.md imports.",
      "",
      "  Plans   - step-by-step guides Claude follows to build things",
      "  Rules   - always-on constraints that shape every AI interaction",
      "  Prompts - reusable templates you run once to get output",
    ].join("\n"),
    "Welcome",
  );

  const action = handleCancel(
    await p.select<FirstRunAction>({
      message: "Let's get you started. What would you like to do?",
      options: [
        { value: "browse" as FirstRunAction, label: "Browse popular packages", hint: "see what's available" },
        { value: "search" as FirstRunAction, label: "Search for something specific" },
        { value: "create" as FirstRunAction, label: "Create your own package", hint: "start from scratch" },
      ],
    }),
  );

  switch (action) {
    case "browse":
      await featuredFlow();
      break;
    case "search":
      await searchFlow();
      break;
    case "create": {
      const { initInteractive } = await import("./init.js");
      await initInteractive();
      break;
    }
  }

  // After first action, drop into the regular menu
  const cont = handleCancel(
    await p.confirm({
      message: "Continue exploring?",
      initialValue: true,
    }),
  );

  if (cont) {
    await mainMenu();
  } else {
    p.outro("Run `planmode` anytime to come back.");
  }
}

async function featuredFlow(): Promise<void> {
  const index = await withSpinner(
    "Loading packages...",
    () => fetchIndex(),
  );

  // Curate: show a mix of types, pick the most useful-looking ones
  const plans = index.packages.filter((pkg) => pkg.type === "plan");
  const rules = index.packages.filter((pkg) => pkg.type === "rule");
  const prompts = index.packages.filter((pkg) => pkg.type === "prompt");

  // Build a featured list: up to 5 plans, 3 rules, 3 prompts
  const featured: PackageSummary[] = [
    ...plans.slice(0, 5),
    ...rules.slice(0, 3),
    ...prompts.slice(0, 3),
  ];

  if (featured.length === 0) {
    p.log.warn("No packages in the registry yet.");
    return;
  }

  // Group display
  const planOptions = plans.slice(0, 5).map((pkg) => ({
    value: pkg.name,
    label: pkg.name,
    hint: pkg.description.length > 55 ? pkg.description.slice(0, 55) + "..." : pkg.description,
  }));
  const ruleOptions = rules.slice(0, 3).map((pkg) => ({
    value: pkg.name,
    label: pkg.name,
    hint: pkg.description.length > 55 ? pkg.description.slice(0, 55) + "..." : pkg.description,
  }));
  const promptOptions = prompts.slice(0, 3).map((pkg) => ({
    value: pkg.name,
    label: pkg.name,
    hint: pkg.description.length > 55 ? pkg.description.slice(0, 55) + "..." : pkg.description,
  }));

  // Show all in one select with separator-style labels
  const allOptions: { value: string; label: string; hint?: string }[] = [];

  if (planOptions.length > 0) {
    allOptions.push(...planOptions);
  }
  if (ruleOptions.length > 0) {
    allOptions.push(...ruleOptions);
  }
  if (promptOptions.length > 0) {
    allOptions.push(...promptOptions);
  }

  const selected = handleCancel(
    await p.select({
      message: `${index.packages.length} packages available. Pick one to install:`,
      options: [
        ...allOptions,
        { value: "__more__", label: "Browse by category..." },
      ],
    }),
  );

  if (selected === "__more__") {
    await browseFlow();
    return;
  }

  await installOrDetailFlow(selected);
}

// ── Main menu (returning users) ──

async function mainMenu(): Promise<void> {
  p.intro("planmode");

  while (true) {
    const action = handleCancel(
      await p.select<Action>({
        message: "What would you like to do?",
        options: [
          { value: "search" as Action, label: "Search packages", hint: "find packages by keyword" },
          { value: "browse" as Action, label: "Browse by category" },
          { value: "install" as Action, label: "Install a package", hint: "install by name" },
          { value: "create" as Action, label: "Create a new package" },
          { value: "list" as Action, label: "My installed packages" },
          { value: "doctor" as Action, label: "Health check" },
          { value: "exit" as Action, label: "Exit" },
        ],
      }),
    );

    switch (action) {
      case "search":
        await searchFlow();
        break;
      case "browse":
        await browseFlow();
        break;
      case "install":
        await installFlow();
        break;
      case "create": {
        const { initInteractive } = await import("./init.js");
        await initInteractive();
        break;
      }
      case "list":
        listFlow();
        break;
      case "doctor":
        doctorFlow();
        break;
      case "exit":
        p.outro("Goodbye!");
        return;
    }
  }
}

// ── Shared flows ──

async function searchFlow(): Promise<void> {
  const query = handleCancel(
    await p.text({
      message: "Search for packages:",
      placeholder: "e.g. nextjs, tailwind, auth",
      validate(input) {
        if (!input) return "Please enter a search query";
      },
    }),
  );

  const results = await withSpinner(
    "Searching registry...",
    () => searchPackages(query),
  );

  if (results.length === 0) {
    p.log.warn("No packages found matching your query.");
    return;
  }

  p.log.info(`Found ${results.length} package(s)`);

  await packageSelectionFlow(results.map((r) => ({
    name: r.name,
    type: r.type,
    version: r.version,
    description: r.description,
  })));
}

async function browseFlow(): Promise<void> {
  const category = handleCancel(
    await p.select({
      message: "Select a category:",
      options: CATEGORIES.map((cat) => ({
        value: cat,
        label: cat,
      })),
    }),
  );

  const results = await withSpinner(
    `Loading ${category} packages...`,
    () => searchPackages("", { category }),
  );

  if (results.length === 0) {
    p.log.warn(`No packages found in category "${category}".`);
    return;
  }

  p.log.info(`Found ${results.length} package(s) in "${category}"`);

  await packageSelectionFlow(results.map((r) => ({
    name: r.name,
    type: r.type,
    version: r.version,
    description: r.description,
  })));
}

interface PackageOption {
  name: string;
  type: string;
  version: string;
  description: string;
}

async function packageSelectionFlow(packages: PackageOption[]): Promise<void> {
  const selected = handleCancel(
    await p.select({
      message: "Select a package:",
      options: [
        ...packages.map((pkg) => ({
          value: pkg.name,
          label: `${pkg.name} (${pkg.type} v${pkg.version})`,
          hint: pkg.description.length > 60
            ? pkg.description.slice(0, 60) + "..."
            : pkg.description,
        })),
        { value: "__back__", label: "Back" },
      ],
    }),
  );

  if (selected === "__back__") return;

  await installOrDetailFlow(selected);
}

async function installOrDetailFlow(packageName: string): Promise<void> {
  const action = handleCancel(
    await p.select({
      message: `${packageName}:`,
      options: [
        { value: "install", label: "Install" },
        { value: "details", label: "View details" },
        { value: "back", label: "Back" },
      ],
    }),
  );

  if (action === "install") {
    try {
      await installPackage(packageName, { interactive: true });
      p.log.success(`Installed ${packageName}`);
    } catch (err) {
      p.log.error((err as Error).message);
    }
  } else if (action === "details") {
    try {
      const meta = await withSpinner(
        "Fetching package details...",
        () => fetchPackageMetadata(packageName),
      );
      const lines = [
        `Type:        ${meta.type}`,
        `Author:      ${meta.author}`,
        `License:     ${meta.license}`,
        `Category:    ${meta.category}`,
        `Downloads:   ${meta.downloads.toLocaleString()}`,
        `Versions:    ${meta.versions.join(", ")}`,
        `Repository:  ${meta.repository}`,
      ];
      if (meta.tags?.length) {
        lines.push(`Tags:        ${meta.tags.join(", ")}`);
      }
      if (meta.dependencies?.rules?.length) {
        lines.push(`Dep (rules): ${meta.dependencies.rules.join(", ")}`);
      }
      if (meta.dependencies?.plans?.length) {
        lines.push(`Dep (plans): ${meta.dependencies.plans.join(", ")}`);
      }
      p.note(lines.join("\n"), `${meta.name}@${meta.latest_version}`);

      const nextAction = handleCancel(
        await p.confirm({
          message: "Install this package?",
          initialValue: true,
        }),
      );

      if (nextAction) {
        try {
          await installPackage(packageName, { interactive: true });
          p.log.success(`Installed ${packageName}`);
        } catch (err) {
          p.log.error((err as Error).message);
        }
      }
    } catch (err) {
      p.log.error((err as Error).message);
    }
  }
}

async function installFlow(): Promise<void> {
  const packageName = handleCancel(
    await p.text({
      message: "Package name to install:",
      placeholder: "e.g. nextjs-tailwind-starter",
      validate(input) {
        if (!input) return "Please enter a package name";
      },
    }),
  );

  try {
    await installPackage(packageName, { interactive: true });
    p.log.success(`Installed ${packageName}`);
  } catch (err) {
    p.log.error((err as Error).message);
  }
}

function listFlow(): void {
  const lockfile = readLockfile();
  const entries = Object.entries(lockfile.packages);

  if (entries.length === 0) {
    p.log.info("No packages installed. Select \"Install a package\" to get started.");
    return;
  }

  const lines = entries.map(
    ([name, entry]) =>
      `${name} (${entry.type} v${entry.version}) -> ${entry.installed_to}`,
  );
  p.note(lines.join("\n"), "Installed packages");
}

function doctorFlow(): void {
  const result = runDoctor();

  if (result.issues.length === 0) {
    p.log.success(`Checked ${result.packagesChecked} package(s) — no issues found.`);
    return;
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  for (const issue of errors) {
    p.log.error(issue.message);
  }
  for (const issue of warnings) {
    p.log.warn(issue.message);
  }

  if (errors.length > 0) {
    p.log.error(`${errors.length} error(s), ${warnings.length} warning(s)`);
  } else {
    p.log.warn(`${warnings.length} warning(s)`);
  }
}
