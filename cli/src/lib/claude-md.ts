import fs from "node:fs";
import path from "node:path";

const CLAUDE_MD = "CLAUDE.md";
const PLANMODE_SECTION = "# Planmode";

export function getClaudeMdPath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, CLAUDE_MD);
}

export function addImport(
  planName: string,
  projectDir: string = process.cwd(),
): void {
  const claudeMdPath = getClaudeMdPath(projectDir);
  const importLine = `- @plans/${planName}.md`;

  if (!fs.existsSync(claudeMdPath)) {
    // Create CLAUDE.md with the import
    const content = `${PLANMODE_SECTION}\n${importLine}\n`;
    fs.writeFileSync(claudeMdPath, content, "utf-8");
    return;
  }

  const content = fs.readFileSync(claudeMdPath, "utf-8");

  // Check if import already exists
  if (content.includes(importLine)) {
    return;
  }

  // Find or create Planmode section
  if (content.includes(PLANMODE_SECTION)) {
    // Append under existing section
    const updated = content.replace(PLANMODE_SECTION, `${PLANMODE_SECTION}\n${importLine}`);
    fs.writeFileSync(claudeMdPath, updated, "utf-8");
  } else {
    // Append new section at the end
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    const updated = content + separator + `${PLANMODE_SECTION}\n${importLine}\n`;
    fs.writeFileSync(claudeMdPath, updated, "utf-8");
  }
}

export function removeImport(
  planName: string,
  projectDir: string = process.cwd(),
): void {
  const claudeMdPath = getClaudeMdPath(projectDir);
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const importLine = `- @plans/${planName}.md`;
  const updated = content
    .split("\n")
    .filter((line) => line.trim() !== importLine)
    .join("\n");

  fs.writeFileSync(claudeMdPath, updated, "utf-8");
}

export function listImports(projectDir: string = process.cwd()): string[] {
  const claudeMdPath = getClaudeMdPath(projectDir);
  if (!fs.existsSync(claudeMdPath)) return [];

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const importRegex = /^-\s*@plans\/(.+)\.md$/gm;
  const imports: string[] = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}
