import fs from "node:fs";
import path from "node:path";

export function startMarker(name: string): string {
  return `<!-- planmode:start:${name} -->`;
}

export function endMarker(name: string): string {
  return `<!-- planmode:end:${name} -->`;
}

function section(name: string, content: string): string {
  return `${startMarker(name)}\n${content.trim()}\n${endMarker(name)}`;
}

export function upsertSection(
  filePath: string,
  name: string,
  content: string,
  header = "# Planmode",
): void {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf-8")
    : `${header}\n`;

  const start = startMarker(name);
  const end = endMarker(name);
  const startIndex = existing.indexOf(start);

  let updated: string;
  if (startIndex !== -1) {
    const endIndex = existing.indexOf(end, startIndex);
    if (endIndex === -1) {
      throw new Error(`Malformed Planmode section for "${name}" in ${filePath}.`);
    }
    updated =
      existing.slice(0, startIndex) +
      section(name, content) +
      existing.slice(endIndex + end.length);
  } else {
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    updated = `${existing}${separator}${section(name, content)}\n`;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, updated, "utf-8");
}

export function removeSection(filePath: string, name: string): void {
  if (!fs.existsSync(filePath)) return;

  const existing = fs.readFileSync(filePath, "utf-8");
  const start = startMarker(name);
  const end = endMarker(name);
  const startIndex = existing.indexOf(start);
  if (startIndex === -1) return;

  const endIndex = existing.indexOf(end, startIndex);
  if (endIndex === -1) return;

  const before = existing.slice(0, startIndex).replace(/\n+$/, "");
  const after = existing.slice(endIndex + end.length).replace(/^\n+/, "");
  const updated = [before, after].filter(Boolean).join("\n\n");
  fs.writeFileSync(filePath, updated ? `${updated}\n` : "", "utf-8");
}

export function hasSection(filePath: string, name: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, "utf-8").includes(startMarker(name));
}
