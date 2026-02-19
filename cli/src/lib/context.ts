import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { ContextIndex, ContextRepoIndex, IndexedFile } from "../types/index.js";
import { logger } from "./logger.js";

const CONTEXT_DIR = ".planmode";
const CONTEXT_FILE = "context.yaml";

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".pdf", ".rtf",
  ".doc", ".docx", ".csv", ".tsv", ".json",
  ".yaml", ".yml", ".xml", ".html", ".htm",
  ".rst", ".org", ".tex", ".log",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", ".tox",
  "target", "out", ".cache", ".turbo",
  "coverage", ".nyc_output",
]);

function getContextPath(projectDir: string): string {
  return path.join(projectDir, CONTEXT_DIR, CONTEXT_FILE);
}

function emptyIndex(): ContextIndex {
  return { version: 1, repos: [] };
}

export function readContextIndex(projectDir: string = process.cwd()): ContextIndex {
  const filePath = getContextPath(projectDir);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = parse(raw) as ContextIndex;
    return data ?? emptyIndex();
  } catch {
    return emptyIndex();
  }
}

export function writeContextIndex(index: ContextIndex, projectDir: string = process.cwd()): void {
  const dirPath = path.join(projectDir, CONTEXT_DIR);
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = getContextPath(projectDir);
  fs.writeFileSync(filePath, stringify(index), "utf-8");
}

export function walkDirectory(dirPath: string): IndexedFile[] {
  const files: IndexedFile[] = [];

  function walk(currentPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        try {
          const stat = fs.statSync(fullPath);
          const relativePath = path.relative(dirPath, fullPath);
          files.push({
            path: relativePath,
            extension: ext,
            size: stat.size,
            modified_at: stat.mtime.toISOString(),
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  walk(dirPath);
  return files;
}

export function addContextRepo(
  repoPath: string,
  options: { name?: string; projectDir?: string } = {},
): ContextRepoIndex {
  const projectDir = options.projectDir ?? process.cwd();
  const absolutePath = path.resolve(projectDir, repoPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Directory not found: ${repoPath}`);
  }

  if (!fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Not a directory: ${repoPath}`);
  }

  const index = readContextIndex(projectDir);

  // Store relative path if inside project, absolute otherwise
  const relative = path.relative(projectDir, absolutePath);
  const isInsideProject = !relative.startsWith("..") && !path.isAbsolute(relative);
  const storedPath = isInsideProject ? relative : absolutePath;

  // Check if already added
  const existing = index.repos.find(
    (r) => r.repo.path === storedPath || r.repo.name === options.name,
  );
  if (existing) {
    throw new Error(
      `Context repo already exists: ${existing.repo.name ?? existing.repo.path}. Use \`planmode context reindex\` to refresh.`,
    );
  }

  logger.info(`Scanning ${absolutePath}...`);
  const files = walkDirectory(absolutePath);

  const now = new Date().toISOString();
  const repoIndex: ContextRepoIndex = {
    repo: {
      path: storedPath,
      name: options.name,
      added_at: now,
    },
    files,
    indexed_at: now,
    file_count: files.length,
    total_size: files.reduce((sum, f) => sum + f.size, 0),
  };

  index.repos.push(repoIndex);
  writeContextIndex(index, projectDir);

  logger.success(`Added "${options.name ?? storedPath}" — ${files.length} file(s), ${formatSize(repoIndex.total_size)}`);

  // Log type breakdown
  const breakdown = getTypeBreakdown(files);
  if (breakdown.length > 0) {
    logger.dim(`  ${breakdown.join(", ")}`);
  }

  return repoIndex;
}

export function removeContextRepo(
  pathOrName: string,
  projectDir: string = process.cwd(),
): void {
  const index = readContextIndex(projectDir);

  const idx = index.repos.findIndex(
    (r) => r.repo.path === pathOrName || r.repo.name === pathOrName,
  );

  if (idx === -1) {
    throw new Error(`Context repo not found: ${pathOrName}`);
  }

  const removed = index.repos[idx]!;
  index.repos.splice(idx, 1);
  writeContextIndex(index, projectDir);

  logger.success(`Removed "${removed.repo.name ?? removed.repo.path}"`);
}

export function reindexContext(
  pathOrName?: string,
  projectDir: string = process.cwd(),
): void {
  const index = readContextIndex(projectDir);

  if (index.repos.length === 0) {
    throw new Error("No context repos configured. Use `planmode context add <path>` first.");
  }

  const targets = pathOrName
    ? index.repos.filter(
        (r) => r.repo.path === pathOrName || r.repo.name === pathOrName,
      )
    : index.repos;

  if (pathOrName && targets.length === 0) {
    throw new Error(`Context repo not found: ${pathOrName}`);
  }

  for (const repo of targets) {
    const absolutePath = path.resolve(projectDir, repo.repo.path);

    if (!fs.existsSync(absolutePath)) {
      logger.warn(`Directory not found, skipping: ${repo.repo.path}`);
      continue;
    }

    logger.info(`Re-scanning ${repo.repo.name ?? repo.repo.path}...`);
    const files = walkDirectory(absolutePath);

    repo.files = files;
    repo.indexed_at = new Date().toISOString();
    repo.file_count = files.length;
    repo.total_size = files.reduce((sum, f) => sum + f.size, 0);

    logger.success(`Reindexed "${repo.repo.name ?? repo.repo.path}" — ${files.length} file(s), ${formatSize(repo.total_size)}`);
  }

  writeContextIndex(index, projectDir);
}

export interface ContextSummary {
  totalRepos: number;
  totalFiles: number;
  totalSize: number;
  repos: Array<{
    name: string;
    path: string;
    fileCount: number;
    totalSize: number;
    typeBreakdown: string[];
    indexedAt: string;
  }>;
}

export function getContextSummary(projectDir: string = process.cwd()): ContextSummary {
  const index = readContextIndex(projectDir);

  return {
    totalRepos: index.repos.length,
    totalFiles: index.repos.reduce((sum, r) => sum + r.file_count, 0),
    totalSize: index.repos.reduce((sum, r) => sum + r.total_size, 0),
    repos: index.repos.map((r) => ({
      name: r.repo.name ?? r.repo.path,
      path: r.repo.path,
      fileCount: r.file_count,
      totalSize: r.total_size,
      typeBreakdown: getTypeBreakdown(r.files),
      indexedAt: r.indexed_at,
    })),
  };
}

function getTypeBreakdown(files: IndexedFile[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => `${ext}: ${count}`);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
