import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { ClientAdapter } from "./types.js";

function rulePath(name: string, projectDir: string): string {
  return path.join(projectDir, ".cursor", "rules", `${name}.mdc`);
}

function renderRule(
  content: string,
  description: string,
  alwaysApply: boolean,
): string {
  const frontmatter = stringify({ description, alwaysApply }).trim();
  return `---\n${frontmatter}\n---\n\n${content.trim()}\n`;
}

export const cursorAdapter: ClientAdapter = {
  id: "cursor",
  label: "Cursor",
  capabilities: {
    headless: false,
    hooks: false,
    transcript: false,
    permissions: false,
    mcp: true,
  },
  instructionFiles(projectDir) {
    return [path.join(projectDir, ".cursor", "rules")];
  },
  apply(ctx) {
    if (ctx.type === "prompt") return;

    const description = ctx.description ?? `${ctx.name} (${ctx.type})`;
    const file = rulePath(ctx.name, ctx.projectDir);
    const content =
      ctx.type === "rule"
        ? renderRule(ctx.content, description, true)
        : renderRule(ctx.content, `Plan: ${description}`, false);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf-8");
  },
  remove(ctx) {
    if (ctx.type === "prompt") return;
    const file = rulePath(ctx.name, ctx.projectDir);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  },
  check(ctx) {
    if (ctx.type === "prompt") return [];
    return fs.existsSync(rulePath(ctx.name, ctx.projectDir))
      ? []
      : [`missing Cursor rule: .cursor/rules/${ctx.name}.mdc`];
  },
};
