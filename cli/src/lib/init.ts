import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { PackageType, Category } from "../types/index.js";
import { getPlanTemplate, getRuleTemplate, getPromptTemplate } from "./templates.js";

export interface InitOptions {
  name: string;
  type: PackageType;
  description: string;
  author: string;
  license?: string;
  tags?: string[];
  category?: Category;
  projectDir?: string;
}

export interface InitResult {
  files: string[];
  manifestPath: string;
  contentPath: string;
}

export function createPackage(options: InitOptions): InitResult {
  const {
    name,
    type,
    description,
    author,
    license = "MIT",
    tags = [],
    category = "other",
    projectDir = process.cwd(),
  } = options;

  const manifest: Record<string, unknown> = {
    name,
    version: "1.0.0",
    type,
    description,
    author,
    license,
  };

  if (tags.length > 0) manifest["tags"] = tags;
  manifest["category"] = category;

  const contentFile = `${type}.md`;
  manifest["content_file"] = contentFile;

  // Write planmode.yaml
  const yamlContent = stringify(manifest);
  const manifestPath = path.join(projectDir, "planmode.yaml");
  fs.writeFileSync(manifestPath, yamlContent, "utf-8");

  // Write stub content file
  const stubs: Record<string, string> = {
    plan: getPlanTemplate(name),
    rule: getRuleTemplate(name),
    prompt: getPromptTemplate(name),
  };

  const contentPath = path.join(projectDir, contentFile);
  fs.writeFileSync(contentPath, stubs[type] ?? stubs["plan"]!, "utf-8");

  return {
    files: ["planmode.yaml", contentFile],
    manifestPath,
    contentPath,
  };
}
