import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { stringify } from "yaml";

const RECORDING_FILE = ".planmode-recording";

export interface RecordingStep {
  title: string;
  message: string;
  filesChanged: string[];
  sha: string;
}

export interface RecordingResult {
  steps: RecordingStep[];
  planContent: string;
  manifestContent: string;
  totalCommits: number;
  totalFilesChanged: number;
}

export function startRecording(projectDir: string = process.cwd()): string {
  const git = simpleGit(projectDir);
  // We need to do this synchronously-ish, so we write a marker file
  // The actual SHA will be resolved in the async wrapper
  const recordingPath = path.join(projectDir, RECORDING_FILE);

  if (fs.existsSync(recordingPath)) {
    const existing = fs.readFileSync(recordingPath, "utf-8").trim();
    throw new Error(
      `Recording already in progress (started at ${existing}). Run \`planmode record stop\` first.`,
    );
  }

  return recordingPath;
}

export async function startRecordingAsync(projectDir: string = process.cwd()): Promise<string> {
  const recordingPath = startRecording(projectDir);
  const git = simpleGit(projectDir);
  const log = await git.log({ n: 1 });
  const sha = log.latest?.hash;

  if (!sha) {
    throw new Error("No commits found in this repository.");
  }

  fs.writeFileSync(recordingPath, sha, "utf-8");
  return sha;
}

export function isRecording(projectDir: string = process.cwd()): boolean {
  return fs.existsSync(path.join(projectDir, RECORDING_FILE));
}

export async function stopRecording(
  projectDir: string = process.cwd(),
  options: { name?: string; author?: string } = {},
): Promise<RecordingResult> {
  const recordingPath = path.join(projectDir, RECORDING_FILE);

  if (!fs.existsSync(recordingPath)) {
    throw new Error("No recording in progress. Run `planmode record start` first.");
  }

  const startSha = fs.readFileSync(recordingPath, "utf-8").trim();
  const git = simpleGit(projectDir);

  // Get commits since the start SHA
  const log = await git.log({ from: startSha, to: "HEAD" });

  if (log.total === 0) {
    fs.unlinkSync(recordingPath);
    throw new Error("No commits since recording started. Nothing to capture.");
  }

  // Process each commit into a step (oldest first)
  const commits = [...log.all].reverse();
  const steps: RecordingStep[] = [];
  const allFilesChanged = new Set<string>();

  for (const commit of commits) {
    // Get files changed in this commit
    const diff = await git.diffSummary([`${commit.hash}~1`, commit.hash]).catch(() =>
      // First commit in range might not have a parent in range
      git.diffSummary([startSha, commit.hash]),
    );

    const filesChanged = diff.files.map((f) => f.file);
    filesChanged.forEach((f) => allFilesChanged.add(f));

    // Clean up commit message for use as step title
    const firstLine = commit.message.split("\n")[0]!.trim();
    const body = commit.message.split("\n").slice(1).join("\n").trim();

    steps.push({
      title: firstLine,
      message: body || firstLine,
      filesChanged,
      sha: commit.hash.slice(0, 7),
    });
  }

  // Generate plan content
  const planName = options.name || inferPlanName(steps);
  const planContent = generatePlanContent(planName, steps);
  const manifestContent = generateManifest(planName, options.author || "");

  // Clean up recording file
  fs.unlinkSync(recordingPath);

  return {
    steps,
    planContent,
    manifestContent,
    totalCommits: commits.length,
    totalFilesChanged: allFilesChanged.size,
  };
}

function inferPlanName(steps: RecordingStep[]): string {
  // Try to infer a name from the commit messages
  const words = steps
    .map((s) => s.title.toLowerCase())
    .join(" ")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "for", "add", "fix", "update", "set"].includes(w));

  // Take the most common meaningful words
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const topWords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  return topWords.length > 0 ? topWords.join("-") + "-setup" : "recorded-plan";
}

function generatePlanContent(name: string, steps: RecordingStep[]): string {
  const lines: string[] = [];

  lines.push(`# ${name}`);
  lines.push("");
  lines.push("## Steps");
  lines.push("");

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    lines.push(`### ${i + 1}. ${step.title}`);
    lines.push("");

    if (step.message !== step.title) {
      lines.push(step.message);
      lines.push("");
    }

    if (step.filesChanged.length > 0) {
      lines.push("**Files changed:**");
      for (const file of step.filesChanged) {
        lines.push(`- \`${file}\``);
      }
      lines.push("");
    }
  }

  lines.push("## Verification");
  lines.push("");
  lines.push("- [ ] All steps completed successfully");
  lines.push("- [ ] Application builds without errors");
  lines.push("- [ ] Tests pass");
  lines.push("");

  return lines.join("\n");
}

function generateManifest(name: string, author: string): string {
  const manifest: Record<string, unknown> = {
    name,
    version: "1.0.0",
    type: "plan",
    description: `Plan recorded from git history`,
    author: author || "unknown",
    license: "MIT",
    category: "other",
    content_file: "plan.md",
  };

  return stringify(manifest);
}
