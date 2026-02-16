import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { PackageManifest, PackageType, VariableType, Category } from "../types/index.js";

const NAME_REGEX = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const VALID_TYPES: PackageType[] = ["prompt", "rule", "plan"];
const VALID_VAR_TYPES: VariableType[] = ["string", "number", "boolean", "enum", "resolved"];
const VALID_CATEGORIES: Category[] = [
  "frontend", "backend", "devops", "database", "testing",
  "mobile", "ai-ml", "design", "security", "other",
];

export function parseManifest(raw: string): PackageManifest {
  const data = parse(raw);
  if (!data || typeof data !== "object") {
    throw new Error("Invalid YAML: manifest must be an object");
  }
  return data as PackageManifest;
}

export function readManifest(dir: string): PackageManifest {
  const manifestPath = path.join(dir, "planmode.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No planmode.yaml found in ${dir}`);
  }
  const raw = fs.readFileSync(manifestPath, "utf-8");
  return parseManifest(raw);
}

export function validateManifest(manifest: PackageManifest, requirePublishFields = false): string[] {
  const errors: string[] = [];

  // Required fields
  if (!manifest.name) {
    errors.push("Missing required field: name");
  } else if (!NAME_REGEX.test(manifest.name)) {
    errors.push(`Invalid name "${manifest.name}": must match ${NAME_REGEX}`);
  } else if (manifest.name.length > 100) {
    errors.push("Name must be 100 characters or fewer");
  }

  if (!manifest.version) {
    errors.push("Missing required field: version");
  } else if (!SEMVER_REGEX.test(manifest.version)) {
    errors.push(`Invalid version "${manifest.version}": must be valid semver (X.Y.Z)`);
  }

  if (!manifest.type) {
    errors.push("Missing required field: type");
  } else if (!VALID_TYPES.includes(manifest.type)) {
    errors.push(`Invalid type "${manifest.type}": must be one of ${VALID_TYPES.join(", ")}`);
  }

  // Publish fields
  if (requirePublishFields) {
    if (!manifest.description) errors.push("Missing required field: description");
    if (manifest.description && manifest.description.length > 200) {
      errors.push("Description must be 200 characters or fewer");
    }
    if (!manifest.author) errors.push("Missing required field: author");
    if (!manifest.license) errors.push("Missing required field: license");
  }

  // Optional field validation
  if (manifest.tags) {
    if (manifest.tags.length > 10) {
      errors.push("Maximum 10 tags allowed");
    }
    for (const tag of manifest.tags) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
        errors.push(`Invalid tag "${tag}": must be lowercase alphanumeric with hyphens`);
      }
    }
  }

  if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
    errors.push(`Invalid category "${manifest.category}": must be one of ${VALID_CATEGORIES.join(", ")}`);
  }

  // Dependencies only for plan and rule
  if (manifest.dependencies && manifest.type === "prompt") {
    errors.push("Dependencies are not allowed for prompt type packages");
  }

  // Variable validation
  if (manifest.variables) {
    for (const [varName, varDef] of Object.entries(manifest.variables)) {
      if (!varDef.type || !VALID_VAR_TYPES.includes(varDef.type)) {
        errors.push(`Variable "${varName}" has invalid type: must be one of ${VALID_VAR_TYPES.join(", ")}`);
      }
      if (varDef.type === "enum" && (!varDef.options || varDef.options.length === 0)) {
        errors.push(`Variable "${varName}" of type enum must have options`);
      }
    }
  }

  // Content
  if (manifest.content && manifest.content_file) {
    errors.push("Cannot specify both content and content_file");
  }

  return errors;
}

export function readPackageContent(dir: string, manifest: PackageManifest): string {
  if (manifest.content) {
    return manifest.content;
  }
  if (manifest.content_file) {
    const contentPath = path.join(dir, manifest.content_file);
    if (!fs.existsSync(contentPath)) {
      throw new Error(`Content file not found: ${manifest.content_file}`);
    }
    return fs.readFileSync(contentPath, "utf-8");
  }
  throw new Error("Package must specify either content or content_file");
}
