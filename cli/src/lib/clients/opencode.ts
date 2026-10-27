import path from "node:path";
import type { ClientAdapter } from "./types.js";
import { hasSection, removeSection, upsertSection } from "./managed-sections.js";

const AGENTS_FILE = "AGENTS.md";

function agentsPath(projectDir: string): string {
  return path.join(projectDir, AGENTS_FILE);
}

function configPath(projectDir: string): string {
  return path.join(projectDir, "opencode.json");
}

export const opencodeAdapter: ClientAdapter = {
  id: "opencode",
  label: "OpenCode",
  capabilities: {
    headless: true,
    hooks: true,
    transcript: true,
    permissions: true,
    mcp: true,
  },
  instructionFiles(projectDir) {
    return [
      agentsPath(projectDir),
      configPath(projectDir),
      path.join(projectDir, "opencode.jsonc"),
    ];
  },
  apply(ctx) {
    // OpenCode discovers AGENTS.md automatically. Keeping the managed section
    // here means one instruction surface works for both Codex and OpenCode.
    if (ctx.type === "rule") {
      upsertSection(
        agentsPath(ctx.projectDir),
        ctx.name,
        `## Rule: ${ctx.name}\n\n${ctx.content}`,
      );
    } else if (ctx.type === "plan") {
      const description = ctx.description ?? `${ctx.name} (plan)`;
      upsertSection(
        agentsPath(ctx.projectDir),
        ctx.name,
        `## Plan: ${ctx.name}\n\nRead \`plans/${ctx.name}.md\` before implementing tasks related to: ${description}`,
      );
    }
  },
  remove(ctx) {
    if (ctx.type === "rule" || ctx.type === "plan") {
      removeSection(agentsPath(ctx.projectDir), ctx.name);
    }
  },
  check(ctx) {
    if (ctx.type === "prompt") return [];
    return hasSection(agentsPath(ctx.projectDir), ctx.name)
      ? []
      : [`${AGENTS_FILE} is missing the Planmode section for "${ctx.name}"`];
  },
};
