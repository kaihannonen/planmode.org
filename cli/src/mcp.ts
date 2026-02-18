import fs from "node:fs";
import path from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { logger } from "./lib/logger.js";
import { searchPackages, fetchPackageMetadata, fetchVersionMetadata } from "./lib/registry.js";
import { installPackage, uninstallPackage, updatePackage } from "./lib/installer.js";
import { readLockfile } from "./lib/lockfile.js";
import { readManifest, validateManifest, parseManifest, readPackageContent } from "./lib/manifest.js";
import { renderTemplate, collectVariableValues } from "./lib/template.js";
import { createPackage } from "./lib/init.js";
import { publishPackage } from "./lib/publisher.js";
import { resolveVersion } from "./lib/resolver.js";
import { fetchFileAtTag } from "./lib/git.js";
import type { Category } from "./types/index.js";

// ── Helpers ──

function withCapture<T>(fn: () => T): { result: T; messages: string[] } {
  logger.capture();
  try {
    const result = fn();
    const messages = logger.flush();
    return { result, messages };
  } catch (err) {
    const messages = logger.flush();
    throw Object.assign(err as Error, { capturedMessages: messages });
  }
}

async function withCaptureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; messages: string[] }> {
  logger.capture();
  try {
    const result = await fn();
    const messages = logger.flush();
    return { result, messages };
  } catch (err) {
    const messages = logger.flush();
    throw Object.assign(err as Error, { capturedMessages: messages });
  }
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

function formatMessages(messages: string[], extra?: string): string {
  const parts: string[] = [];
  if (messages.length > 0) {
    parts.push(messages.filter((m) => m !== "").join("\n"));
  }
  if (extra) {
    parts.push(extra);
  }
  return parts.join("\n\n");
}

/** Rewrite CLI-oriented error messages for MCP context */
function adaptError(message: string): string {
  return message
    .replace(/Run `planmode login` first\./, "Authentication required. Configure a GitHub token via `planmode login` in your terminal, or set the PLANMODE_GITHUB_TOKEN environment variable.")
    .replace(/Run `planmode search <query>` to find packages\./, "Try using the planmode_search tool to find packages.")
    .replace(/Run `planmode install (.+?)` to get started\./, "Use the planmode_install tool to install packages.")
    .replace(/Install it first: planmode install (.+)/, "Install it first using the planmode_install tool.")
    .replace(/run `planmode publish` when ready\./, "use the planmode_publish tool when ready.");
}

function errorResult(prefix: string, err: Error): ReturnType<typeof textResult> {
  const capturedMessages = (err as Error & { capturedMessages?: string[] }).capturedMessages;
  const msgPrefix = capturedMessages?.length ? capturedMessages.join("\n") + "\n\n" : "";
  return textResult(adaptError(`${msgPrefix}${prefix}: ${err.message}`), true);
}

// ── Server ──

const server = new McpServer({
  name: "planmode",
  version: "0.1.5",
});

// ── Tools ──

// -- planmode_search --
server.registerTool(
  "planmode_search",
  {
    description: "Search the planmode registry for packages (plans, rules, and prompts for AI-assisted development)",
    inputSchema: {
      query: z.string().describe("Search query to find packages"),
      type: z.enum(["prompt", "rule", "plan"]).optional().describe("Filter by package type"),
      category: z.string().optional().describe("Filter by category (frontend, backend, devops, database, testing, mobile, ai-ml, design, security, other)"),
    },
  },
  async ({ query, type, category }) => {
    try {
      const { result: results, messages } = await withCaptureAsync(() =>
        searchPackages(query, { type, category }),
      );

      if (results.length === 0) {
        return textResult(formatMessages(messages, "No packages found matching your query."));
      }

      const table = results
        .map(
          (pkg) =>
            `- **${pkg.name}** (${pkg.type} v${pkg.version}) — ${pkg.description}`,
        )
        .join("\n");

      return textResult(formatMessages(messages, `Found ${results.length} package(s):\n\n${table}`));
    } catch (err) {
      return errorResult("Error searching registry", err as Error);
    }
  },
);

// -- planmode_info --
server.registerTool(
  "planmode_info",
  {
    description: "Get detailed information about a planmode package including versions, dependencies, and variables. Use this before installing to understand what a package provides and what variables it needs.",
    inputSchema: {
      package: z.string().describe("Package name (e.g., nextjs-tailwind-starter)"),
    },
  },
  async ({ package: packageName }) => {
    try {
      const { result: meta, messages } = await withCaptureAsync(() =>
        fetchPackageMetadata(packageName),
      );

      const lines = [
        `# ${meta.name}@${meta.latest_version}`,
        "",
        `**Description:** ${meta.description}`,
        `**Type:** ${meta.type}`,
        `**Author:** ${meta.author}`,
        `**License:** ${meta.license}`,
        `**Category:** ${meta.category}`,
        `**Downloads:** ${meta.downloads.toLocaleString()}`,
        `**Repository:** ${meta.repository}`,
      ];

      if (meta.models && meta.models.length > 0) {
        lines.push(`**Models:** ${meta.models.join(", ")}`);
      }
      if (meta.tags && meta.tags.length > 0) {
        lines.push(`**Tags:** ${meta.tags.join(", ")}`);
      }
      lines.push(`**Versions:** ${meta.versions.join(", ")}`);

      if (meta.dependencies) {
        if (meta.dependencies.rules?.length) {
          lines.push(`**Dependencies (rules):** ${meta.dependencies.rules.join(", ")}`);
        }
        if (meta.dependencies.plans?.length) {
          lines.push(`**Dependencies (plans):** ${meta.dependencies.plans.join(", ")}`);
        }
      }

      if (meta.variables) {
        lines.push("", "**Variables:**");
        for (const [name, def] of Object.entries(meta.variables)) {
          const required = def.required ? " (required)" : "";
          const defaultVal = def.default !== undefined ? ` [default: ${def.default}]` : "";
          lines.push(`- \`${name}\`: ${def.type}${required}${defaultVal} — ${def.description}`);
          if (def.options) {
            lines.push(`  Options: ${def.options.join(", ")}`);
          }
        }
      }

      return textResult(formatMessages(messages, lines.join("\n")));
    } catch (err) {
      return errorResult("Error fetching package info", err as Error);
    }
  },
);

// -- planmode_preview --
server.registerTool(
  "planmode_preview",
  {
    description: "Preview the full content of a planmode package from the registry without installing it. Returns the raw markdown content so you can review what the package does before installing.",
    inputSchema: {
      package: z.string().describe("Package name to preview"),
      version: z.string().optional().describe("Specific version to preview (default: latest)"),
    },
  },
  async ({ package: packageName, version }) => {
    try {
      const { result: resolved, messages: resolveMessages } = await withCaptureAsync(() =>
        resolveVersion(packageName, version),
      );

      const versionMeta = await fetchVersionMetadata(packageName, resolved.version);

      const basePath = versionMeta.source.path ? `${versionMeta.source.path}/` : "";
      const manifestRaw = await fetchFileAtTag(
        versionMeta.source.repository,
        versionMeta.source.tag,
        `${basePath}planmode.yaml`,
      );
      const manifest = parseManifest(manifestRaw);

      let content: string;
      if (manifest.content) {
        content = manifest.content;
      } else if (manifest.content_file) {
        content = await fetchFileAtTag(
          versionMeta.source.repository,
          versionMeta.source.tag,
          `${basePath}${manifest.content_file}`,
        );
      } else {
        return textResult("Package has no content or content_file defined.", true);
      }

      const header = [
        `# Preview: ${packageName}@${resolved.version}`,
        `**Type:** ${manifest.type} | **Author:** ${manifest.author ?? "unknown"}`,
        manifest.description ? `**Description:** ${manifest.description}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const variableNote =
        manifest.variables && Object.keys(manifest.variables).length > 0
          ? `\n**Note:** This package uses template variables (${Object.keys(manifest.variables).join(", ")}). Content below shows raw templates.\n`
          : "";

      return textResult(`${header}${variableNote}\n---\n\n${content}`);
    } catch (err) {
      return errorResult("Error previewing package", err as Error);
    }
  },
);

// -- planmode_install --
server.registerTool(
  "planmode_install",
  {
    description: "Install a planmode package into the current project. Places plans in plans/, rules in .claude/rules/, prompts in prompts/. Updates CLAUDE.md with @import for plans. Use planmode_info first to check for required variables.",
    inputSchema: {
      package: z.string().describe("Package name to install"),
      version: z.string().optional().describe("Specific version to install (default: latest)"),
      asRule: z.boolean().optional().describe("Force install as a rule to .claude/rules/"),
      variables: z.record(z.string(), z.string()).optional().describe("Template variable values as key-value pairs"),
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ package: packageName, version, asRule, variables, projectDir }) => {
    try {
      const { messages } = await withCaptureAsync(() =>
        installPackage(packageName, {
          version,
          forceRule: asRule,
          noInput: true,
          variables: variables as Record<string, string> | undefined,
          projectDir,
        }),
      );

      return textResult(adaptError(formatMessages(messages) || `Installed ${packageName} successfully.`));
    } catch (err) {
      return errorResult("Error installing package", err as Error);
    }
  },
);

// -- planmode_uninstall --
server.registerTool(
  "planmode_uninstall",
  {
    description: "Remove an installed planmode package from the current project",
    inputSchema: {
      package: z.string().describe("Package name to uninstall"),
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ package: packageName, projectDir }) => {
    try {
      const { messages } = await withCaptureAsync(() =>
        uninstallPackage(packageName, projectDir),
      );

      return textResult(formatMessages(messages) || `Uninstalled ${packageName} successfully.`);
    } catch (err) {
      return errorResult("Error uninstalling package", err as Error);
    }
  },
);

// -- planmode_list --
server.registerTool(
  "planmode_list",
  {
    description: "List all planmode packages installed in the current project",
    inputSchema: {
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ projectDir }) => {
    try {
      const lockfile = readLockfile(projectDir);
      const entries = Object.entries(lockfile.packages);

      if (entries.length === 0) {
        return textResult("No packages installed. Use the planmode_install tool to install a package.");
      }

      const table = entries
        .map(
          ([name, entry]) =>
            `- **${name}** (${entry.type} v${entry.version}) → ${entry.installed_to}`,
        )
        .join("\n");

      return textResult(`${entries.length} package(s) installed:\n\n${table}`);
    } catch (err) {
      return errorResult("Error listing packages", err as Error);
    }
  },
);

// -- planmode_read --
server.registerTool(
  "planmode_read",
  {
    description: "Read the content of an installed planmode package from disk. Use this to view what a plan, rule, or prompt contains after installation.",
    inputSchema: {
      package: z.string().describe("Package name to read"),
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ package: packageName, projectDir }) => {
    try {
      const dir = projectDir ?? process.cwd();
      const lockfile = readLockfile(dir);
      const entry = lockfile.packages[packageName];

      if (!entry) {
        // Try to find it by looking in common locations
        const candidates = [
          path.join(dir, "plans", `${packageName}.md`),
          path.join(dir, ".claude", "rules", `${packageName}.md`),
          path.join(dir, "prompts", `${packageName}.md`),
        ];

        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) {
            const content = fs.readFileSync(candidate, "utf-8");
            const relativePath = path.relative(dir, candidate);
            return textResult(`# ${packageName}\n**Location:** ${relativePath}\n\n---\n\n${content}`);
          }
        }

        return textResult(
          `Package '${packageName}' is not installed. Use planmode_list to see installed packages, or planmode_preview to view a package from the registry.`,
          true,
        );
      }

      const fullPath = path.join(dir, entry.installed_to);
      if (!fs.existsSync(fullPath)) {
        return textResult(
          `Package '${packageName}' is in the lockfile but the file is missing at ${entry.installed_to}. Try reinstalling with planmode_install.`,
          true,
        );
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return textResult(
        `# ${packageName} (${entry.type} v${entry.version})\n**Location:** ${entry.installed_to}\n\n---\n\n${content}`,
      );
    } catch (err) {
      return errorResult("Error reading package", err as Error);
    }
  },
);

// -- planmode_update --
server.registerTool(
  "planmode_update",
  {
    description: "Update installed planmode packages to their latest compatible versions",
    inputSchema: {
      package: z.string().optional().describe("Package name to update (omit to update all)"),
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ package: packageName, projectDir }) => {
    try {
      if (packageName) {
        const { result: updated, messages } = await withCaptureAsync(() =>
          updatePackage(packageName, projectDir),
        );
        if (!updated) {
          return textResult(formatMessages(messages, `${packageName} is already up to date.`));
        }
        return textResult(formatMessages(messages) || `Updated ${packageName} successfully.`);
      }

      // Update all
      const lockfile = readLockfile(projectDir);
      const names = Object.keys(lockfile.packages);

      if (names.length === 0) {
        return textResult("No packages installed.");
      }

      const results: string[] = [];
      let updatedCount = 0;

      for (const name of names) {
        try {
          const { result: updated, messages } = await withCaptureAsync(() =>
            updatePackage(name, projectDir),
          );
          if (updated) {
            updatedCount++;
            results.push(`Updated ${name}`);
          }
        } catch (err) {
          results.push(`Failed to update ${name}: ${(err as Error).message}`);
        }
      }

      if (updatedCount === 0) {
        return textResult("All packages are up to date.");
      }

      return textResult(`Updated ${updatedCount} package(s):\n\n${results.join("\n")}`);
    } catch (err) {
      return errorResult("Error updating packages", err as Error);
    }
  },
);

// -- planmode_init --
server.registerTool(
  "planmode_init",
  {
    description: "Initialize a new planmode package by creating planmode.yaml and a content stub file",
    inputSchema: {
      name: z.string().describe("Package name (lowercase, hyphens only)"),
      type: z.enum(["plan", "rule", "prompt"]).describe("Package type"),
      description: z.string().describe("Package description (max 200 chars)"),
      author: z.string().describe("Author GitHub username"),
      license: z.string().optional().describe("License identifier (default: MIT)"),
      tags: z.array(z.string()).optional().describe("Tags for discovery (max 10)"),
      category: z.enum([
        "frontend", "backend", "devops", "database", "testing",
        "mobile", "ai-ml", "design", "security", "other",
      ]).optional().describe("Package category (default: other)"),
      projectDir: z.string().optional().describe("Directory to create the package in (default: current working directory)"),
    },
  },
  async ({ name, type, description, author, license, tags, category, projectDir }) => {
    try {
      const { result, messages } = withCapture(() =>
        createPackage({
          name,
          type,
          description,
          author,
          license,
          tags,
          category: category as Category | undefined,
          projectDir,
        }),
      );

      return textResult(
        formatMessages(
          messages,
          `Created package "${name}":\n- ${result.files.join("\n- ")}\n\nEdit the content file, then use the planmode_publish tool when ready.`,
        ),
      );
    } catch (err) {
      return errorResult("Error creating package", err as Error);
    }
  },
);

// -- planmode_publish --
server.registerTool(
  "planmode_publish",
  {
    description: "Publish a planmode package to the registry. Creates a git tag, forks the registry, and opens a PR. Requires GitHub authentication (configure via `planmode login` in terminal or PLANMODE_GITHUB_TOKEN env var).",
    inputSchema: {
      projectDir: z.string().optional().describe("Directory containing planmode.yaml (default: current working directory)"),
    },
  },
  async ({ projectDir }) => {
    try {
      const { result, messages } = await withCaptureAsync(() =>
        publishPackage({ projectDir }),
      );

      return textResult(
        formatMessages(
          messages,
          `Published ${result.packageName}@${result.version}\nPR: ${result.prUrl}`,
        ),
      );
    } catch (err) {
      return errorResult("Error publishing package", err as Error);
    }
  },
);

// -- planmode_validate --
server.registerTool(
  "planmode_validate",
  {
    description: "Validate a planmode.yaml manifest file for correctness",
    inputSchema: {
      projectDir: z.string().optional().describe("Directory containing planmode.yaml (default: current working directory)"),
      requirePublishFields: z.boolean().optional().describe("Require fields needed for publishing (description, author, license)"),
    },
  },
  async ({ projectDir, requirePublishFields }) => {
    try {
      const dir = projectDir ?? process.cwd();
      const manifest = readManifest(dir);
      const errors = validateManifest(manifest, requirePublishFields ?? false);

      if (errors.length === 0) {
        return textResult(
          `Manifest is valid: ${manifest.name}@${manifest.version} (${manifest.type})`,
        );
      }

      return textResult(
        `Manifest validation failed:\n\n${errors.map((e) => `- ${e}`).join("\n")}`,
        true,
      );
    } catch (err) {
      return errorResult("Error reading manifest", err as Error);
    }
  },
);

// -- planmode_run --
server.registerTool(
  "planmode_run",
  {
    description: "Render a templated planmode prompt with variables and return the result",
    inputSchema: {
      prompt: z.string().describe("Prompt package name (looks in prompts/ directory)"),
      variables: z.record(z.string(), z.string()).optional().describe("Template variable values as key-value pairs"),
      projectDir: z.string().optional().describe("Project directory (default: current working directory)"),
    },
  },
  async ({ prompt: promptName, variables, projectDir }) => {
    try {
      const dir = projectDir ?? process.cwd();
      const localPath = path.join(dir, "prompts", `${promptName}.md`);
      const localManifestPath = path.join(dir, "prompts", promptName, "planmode.yaml");

      let content: string;
      let manifest: ReturnType<typeof parseManifest> | undefined;

      if (fs.existsSync(localManifestPath)) {
        const raw = fs.readFileSync(localManifestPath, "utf-8");
        manifest = parseManifest(raw);
        const promptDir = path.join(dir, "prompts", promptName);
        content = readPackageContent(promptDir, manifest);
      } else if (fs.existsSync(localPath)) {
        content = fs.readFileSync(localPath, "utf-8");
      } else {
        return textResult(
          `Prompt '${promptName}' not found locally. Install it first using the planmode_install tool.`,
          true,
        );
      }

      if (manifest?.variables && Object.keys(manifest.variables).length > 0) {
        const provided = (variables ?? {}) as Record<string, string>;
        const values = collectVariableValues(manifest.variables, provided);
        content = renderTemplate(content, values);
      }

      return textResult(content);
    } catch (err) {
      return errorResult("Error running prompt", err as Error);
    }
  },
);

// ── Resources ──

// Expose installed packages as browsable resources
server.registerResource(
  "installed-packages",
  new ResourceTemplate("planmode://packages/{name}", {
    list: async () => {
      const lockfile = readLockfile();
      return {
        resources: Object.entries(lockfile.packages).map(([name, entry]) => ({
          uri: `planmode://packages/${name}`,
          name: `${name} (${entry.type} v${entry.version})`,
          description: `Installed at ${entry.installed_to}`,
          mimeType: "text/markdown",
        })),
      };
    },
  }),
  {
    description: "Installed planmode packages in the current project. Each resource contains the full content of an installed plan, rule, or prompt.",
    mimeType: "text/markdown",
  },
  async (uri, variables) => {
    const name = variables["name"] as string;
    const lockfile = readLockfile();
    const entry = lockfile.packages[name];

    if (!entry) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `Package '${name}' is not installed.`,
        }],
      };
    }

    const fullPath = path.join(process.cwd(), entry.installed_to);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      content = `File not found at ${entry.installed_to}. The package may need to be reinstalled.`;
    }

    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  },
);

// ── Start server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("planmode MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
