import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { simpleGit } from "simple-git";
import { getGitHubToken } from "./config.js";

function repoCloneUrl(repoUrl: string): string {
  const token = getGitHubToken();
  // Convert github.com/org/repo to https clone URL
  const match = repoUrl.match(/^github\.com\/(.+)$/);
  if (!match) return `https://${repoUrl}.git`;
  if (token) {
    return `https://${token}@github.com/${match[1]}.git`;
  }
  return `https://github.com/${match[1]}.git`;
}

export async function cloneAtTag(
  repoUrl: string,
  tag: string,
  targetDir: string,
): Promise<void> {
  const cloneUrl = repoCloneUrl(repoUrl);
  const git = simpleGit();
  await git.clone(cloneUrl, targetDir, [
    "--depth",
    "1",
    "--branch",
    tag,
    "--single-branch",
  ]);
}

export async function fetchFileAtTag(
  repoUrl: string,
  tag: string,
  filePath: string,
): Promise<string> {
  // Use GitHub raw content API for efficiency
  const match = repoUrl.match(/^github\.com\/([^/]+)\/([^/]+)$/);
  if (match) {
    const token = getGitHubToken();
    const rawUrl = `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${tag}/${filePath}`;
    const headers: Record<string, string> = { "User-Agent": "planmode-cli" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(rawUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filePath} from ${repoUrl}@${tag}: ${response.status}`);
    }
    return response.text();
  }

  // Fallback: clone and read
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planmode-"));
  try {
    await cloneAtTag(repoUrl, tag, tmpDir);
    const fullPath = path.join(tmpDir, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath} in ${repoUrl}@${tag}`);
    }
    return fs.readFileSync(fullPath, "utf-8");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function fetchPackageFiles(
  repoUrl: string,
  tag: string,
  files: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of files) {
    result[file] = await fetchFileAtTag(repoUrl, tag, file);
  }
  return result;
}

export async function getLatestTag(repoUrl: string): Promise<string | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planmode-tags-"));
  try {
    const cloneUrl = repoCloneUrl(repoUrl);
    const git = simpleGit();
    const result = await git.listRemote(["--tags", "--sort=-v:refname", cloneUrl]);
    const lines = result.trim().split("\n");
    if (lines.length === 0 || !lines[0]) return null;

    const match = lines[0].match(/refs\/tags\/(.+)$/);
    return match ? match[1]! : null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function createTag(dir: string, tag: string): Promise<void> {
  const git = simpleGit(dir);
  await git.addTag(tag);
}

export async function pushTag(dir: string, tag: string): Promise<void> {
  const git = simpleGit(dir);
  await git.push("origin", tag);
}

export async function getRemoteUrl(dir: string): Promise<string | null> {
  try {
    const git = simpleGit(dir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    return origin?.refs?.fetch ?? null;
  } catch {
    return null;
  }
}

export async function getHeadSha(dir: string): Promise<string> {
  const git = simpleGit(dir);
  const log = await git.log({ n: 1 });
  return log.latest?.hash ?? "";
}
