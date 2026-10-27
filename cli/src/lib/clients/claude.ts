import fs from "node:fs";
import path from "node:path";
import type { ClientAdapter } from "./types.js";
import { addImport, listImports, removeImport } from "../claude-md.js";
import { canonicalInstallPath } from "./paths.js";

export const claudeAdapter: ClientAdapter = {
  id: "claude",
  label: "Claude Code",
  capabilities: {
    headless: true,
    hooks: true,
    transcript: true,
    permissions: true,
    mcp: true,
  },
  instructionFiles(projectDir) {
    return [path.join(projectDir, "CLAUDE.md")];
  },
  apply(ctx) {
    if (ctx.type === "plan") {
      addImport(ctx.name, ctx.projectDir);
    }
  },
  remove(ctx) {
    if (ctx.type === "plan") {
      removeImport(ctx.name, ctx.projectDir);
    }
  },
  check(ctx) {
    const issues: string[] = [];
    if (ctx.type === "plan" && !listImports(ctx.projectDir).includes(ctx.name)) {
      issues.push(`@plans/${ctx.name}.md is missing from CLAUDE.md`);
    }

    const installed = path.join(ctx.projectDir, canonicalInstallPath(ctx.name, ctx.type));
    if (ctx.type !== "prompt" && !fs.existsSync(installed)) {
      issues.push(`missing installed file: ${canonicalInstallPath(ctx.name, ctx.type)}`);
    }
    return issues;
  },
};
