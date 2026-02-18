import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";

// Config files to detect and describe
const CONFIG_FILES: Record<string, string> = {
  "tsconfig.json": "TypeScript",
  "tsconfig.base.json": "TypeScript (base)",
  ".eslintrc": "ESLint",
  ".eslintrc.js": "ESLint",
  ".eslintrc.json": "ESLint",
  "eslint.config.js": "ESLint (flat config)",
  "eslint.config.mjs": "ESLint (flat config)",
  ".prettierrc": "Prettier",
  ".prettierrc.json": "Prettier",
  "prettier.config.js": "Prettier",
  "tailwind.config.js": "Tailwind CSS",
  "tailwind.config.ts": "Tailwind CSS",
  "tailwind.config.mjs": "Tailwind CSS",
  "postcss.config.js": "PostCSS",
  "postcss.config.mjs": "PostCSS",
  "next.config.js": "Next.js",
  "next.config.mjs": "Next.js",
  "next.config.ts": "Next.js",
  "vite.config.ts": "Vite",
  "vite.config.js": "Vite",
  "astro.config.mjs": "Astro",
  "astro.config.ts": "Astro",
  "svelte.config.js": "SvelteKit",
  "nuxt.config.ts": "Nuxt",
  "remix.config.js": "Remix",
  "webpack.config.js": "Webpack",
  "rollup.config.js": "Rollup",
  "vitest.config.ts": "Vitest",
  "jest.config.js": "Jest",
  "jest.config.ts": "Jest",
  "docker-compose.yml": "Docker Compose",
  "docker-compose.yaml": "Docker Compose",
  "Dockerfile": "Docker",
  ".dockerignore": "Docker",
  "prisma/schema.prisma": "Prisma",
  "drizzle.config.ts": "Drizzle ORM",
  ".env.example": "Environment variables",
  ".github/workflows": "GitHub Actions",
  "vercel.json": "Vercel",
  "netlify.toml": "Netlify",
  "wrangler.toml": "Cloudflare Workers",
  "fly.toml": "Fly.io",
};

interface SnapshotData {
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  detectedTools: { name: string; file: string }[];
  structure: string[];
  scripts: Record<string, string>;
  framework: string | null;
}

export interface SnapshotResult {
  planContent: string;
  manifestContent: string;
  data: SnapshotData;
}

export function takeSnapshot(
  projectDir: string = process.cwd(),
  options: { name?: string; author?: string } = {},
): SnapshotResult {
  const data = analyzeProject(projectDir);

  if (options.name) {
    data.name = options.name;
  }

  const planContent = generatePlanFromSnapshot(data);
  const manifestContent = generateManifestFromSnapshot(data, options.author || "");

  return { planContent, manifestContent, data };
}

function analyzeProject(projectDir: string): SnapshotData {
  let name = path.basename(projectDir) + "-setup";
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const scripts: Record<string, string> = {};

  // Read package.json
  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) name = pkg.name + "-setup";
      if (pkg.dependencies) Object.assign(dependencies, pkg.dependencies);
      if (pkg.devDependencies) Object.assign(devDependencies, pkg.devDependencies);
      if (pkg.scripts) Object.assign(scripts, pkg.scripts);
    } catch {
      // Skip if invalid JSON
    }
  }

  // Detect config files / tools
  const detectedTools: { name: string; file: string }[] = [];
  for (const [file, toolName] of Object.entries(CONFIG_FILES)) {
    const fullPath = path.join(projectDir, file);
    if (fs.existsSync(fullPath)) {
      detectedTools.push({ name: toolName, file });
    }
  }

  // Get directory structure (top 2 levels, skip node_modules/dist/.git)
  const structure = getDirectoryStructure(projectDir, 2);

  // Detect primary framework
  const framework = detectFramework(dependencies, devDependencies);

  // Sanitize name for planmode
  name = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return { name, dependencies, devDependencies, detectedTools, structure, scripts, framework };
}

function detectFramework(
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): string | null {
  const all = { ...deps, ...devDeps };
  if (all["next"]) return "Next.js";
  if (all["astro"]) return "Astro";
  if (all["@sveltejs/kit"]) return "SvelteKit";
  if (all["nuxt"]) return "Nuxt";
  if (all["@remix-run/react"]) return "Remix";
  if (all["vue"]) return "Vue";
  if (all["react"]) return "React";
  if (all["express"]) return "Express";
  if (all["fastify"]) return "Fastify";
  if (all["hono"]) return "Hono";
  return null;
}

function getDirectoryStructure(dir: string, maxDepth: number, depth = 0): string[] {
  const SKIP = new Set([
    "node_modules", "dist", ".git", ".next", ".nuxt", ".svelte-kit",
    ".astro", ".vercel", ".netlify", "build", "coverage", "__pycache__",
    ".turbo", ".cache",
  ]);

  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (SKIP.has(entry.name)) continue;

      const indent = "  ".repeat(depth);
      if (entry.isDirectory()) {
        results.push(`${indent}${entry.name}/`);
        if (depth < maxDepth) {
          results.push(...getDirectoryStructure(path.join(dir, entry.name), maxDepth, depth + 1));
        }
      } else {
        results.push(`${indent}${entry.name}`);
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results;
}

function generatePlanFromSnapshot(data: SnapshotData): string {
  const lines: string[] = [];

  lines.push(`# ${data.name}`);
  lines.push("");

  if (data.framework) {
    lines.push(`Set up a ${data.framework} project with the following tools and configuration.`);
  } else {
    lines.push("Set up a project with the following tools and configuration.");
  }
  lines.push("");

  // Prerequisites
  lines.push("## Prerequisites");
  lines.push("");
  lines.push("- Node.js 20+");
  if (Object.keys(data.dependencies).length > 0 || Object.keys(data.devDependencies).length > 0) {
    lines.push("- npm or your preferred package manager");
  }

  const toolNames = [...new Set(data.detectedTools.map((t) => t.name))];
  if (toolNames.includes("Docker") || toolNames.includes("Docker Compose")) {
    lines.push("- Docker");
  }
  if (toolNames.includes("Prisma")) {
    lines.push("- A PostgreSQL database (or update the Prisma schema for your database)");
  }
  lines.push("");

  // Steps
  lines.push("## Steps");
  lines.push("");

  let stepNum = 1;

  // Step: create project
  if (data.framework) {
    lines.push(`### ${stepNum}. Create ${data.framework} project`);
    lines.push("");
    lines.push(`Initialize a new ${data.framework} project.`);
    lines.push("");
    stepNum++;
  }

  // Step: install dependencies
  const depNames = Object.keys(data.dependencies);
  const devDepNames = Object.keys(data.devDependencies);

  if (depNames.length > 0) {
    lines.push(`### ${stepNum}. Install dependencies`);
    lines.push("");
    lines.push("```bash");
    lines.push(`npm install ${depNames.join(" ")}`);
    lines.push("```");
    lines.push("");
    stepNum++;
  }

  if (devDepNames.length > 0) {
    lines.push(`### ${stepNum}. Install dev dependencies`);
    lines.push("");
    lines.push("```bash");
    lines.push(`npm install -D ${devDepNames.join(" ")}`);
    lines.push("```");
    lines.push("");
    stepNum++;
  }

  // Steps: configure each detected tool
  for (const tool of data.detectedTools) {
    // Avoid duplicating framework config if already mentioned
    if (tool.name === data.framework) continue;
    // Skip generic files
    if (tool.name === "Environment variables") continue;

    lines.push(`### ${stepNum}. Configure ${tool.name}`);
    lines.push("");
    lines.push(`Create or update \`${tool.file}\` with the appropriate configuration.`);
    lines.push("");
    stepNum++;
  }

  // Step: environment variables
  if (data.detectedTools.some((t) => t.name === "Environment variables")) {
    lines.push(`### ${stepNum}. Set up environment variables`);
    lines.push("");
    lines.push("Copy `.env.example` to `.env` and fill in the values:");
    lines.push("");
    lines.push("```bash");
    lines.push("cp .env.example .env");
    lines.push("```");
    lines.push("");
    stepNum++;
  }

  // Step: available scripts
  if (Object.keys(data.scripts).length > 0) {
    lines.push(`### ${stepNum}. Available scripts`);
    lines.push("");
    for (const [name, cmd] of Object.entries(data.scripts)) {
      lines.push(`- \`npm run ${name}\` — \`${cmd}\``);
    }
    lines.push("");
    stepNum++;
  }

  // Project structure
  if (data.structure.length > 0) {
    lines.push("## Project Structure");
    lines.push("");
    lines.push("```");
    for (const line of data.structure.slice(0, 40)) {
      lines.push(line);
    }
    if (data.structure.length > 40) {
      lines.push("  ...");
    }
    lines.push("```");
    lines.push("");
  }

  // Verification
  lines.push("## Verification");
  lines.push("");
  lines.push("- [ ] All dependencies installed without errors");
  lines.push("- [ ] Configuration files are in place");
  if (data.scripts["build"]) lines.push("- [ ] `npm run build` succeeds");
  if (data.scripts["test"]) lines.push("- [ ] `npm run test` passes");
  if (data.scripts["dev"]) lines.push("- [ ] `npm run dev` starts without errors");
  lines.push("");

  return lines.join("\n");
}

function generateManifestFromSnapshot(data: SnapshotData, author: string): string {
  const tags: string[] = [];
  if (data.framework) tags.push(data.framework.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const toolTags = data.detectedTools
    .map((t) => t.name.toLowerCase().replace(/[^a-z0-9]/g, "-"))
    .filter((t) => t.length > 1);
  tags.push(...[...new Set(toolTags)].slice(0, 8));

  const category = detectCategory(data);

  const manifest: Record<string, unknown> = {
    name: data.name,
    version: "1.0.0",
    type: "plan",
    description: data.framework
      ? `Set up a ${data.framework} project with ${data.detectedTools.map((t) => t.name).slice(0, 3).join(", ")}`
      : `Project setup with ${data.detectedTools.map((t) => t.name).slice(0, 3).join(", ")}`,
    author: author || "unknown",
    license: "MIT",
    tags: tags.slice(0, 10),
    category,
    content_file: "plan.md",
  };

  return stringify(manifest);
}

function detectCategory(data: SnapshotData): string {
  const all = { ...data.dependencies, ...data.devDependencies };
  if (all["react"] || all["vue"] || all["svelte"] || all["next"] || all["astro"]) return "frontend";
  if (all["express"] || all["fastify"] || all["hono"] || all["koa"]) return "backend";
  if (data.detectedTools.some((t) => t.name === "Docker" || t.name === "Docker Compose")) return "devops";
  if (all["prisma"] || all["drizzle-orm"] || all["typeorm"]) return "database";
  return "other";
}
