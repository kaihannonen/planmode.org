// ── Package manifest (planmode.yaml) ──

export type PackageType = "prompt" | "rule" | "plan";
export type VariableType = "string" | "number" | "boolean" | "enum" | "resolved";
export type Category =
  | "frontend"
  | "backend"
  | "devops"
  | "database"
  | "testing"
  | "mobile"
  | "ai-ml"
  | "design"
  | "security"
  | "other";

export interface VariableDefinition {
  description: string;
  type: VariableType;
  options?: string[];
  required?: boolean;
  default?: string | number | boolean;
  resolver?: string;
  source?: string;
  extract?: string;
}

export interface PackageManifest {
  name: string;
  version: string;
  type: PackageType;
  description: string;
  author: string;
  license: string;
  repository?: string;
  models?: string[];
  tags?: string[];
  category?: Category;
  dependencies?: {
    rules?: string[];
    plans?: string[];
  };
  variables?: Record<string, VariableDefinition>;
  content?: string;
  content_file?: string;
}

// ── Registry ──

export interface PackageSummary {
  name: string;
  version: string;
  type: PackageType;
  description: string;
  author: string;
  category: string;
  tags: string[];
  downloads: number;
  created_at: string;
  updated_at: string;
}

export interface RegistryIndex {
  version: number;
  updated_at: string;
  packages: PackageSummary[];
}

export interface PackageMetadata {
  name: string;
  description: string;
  author: string;
  license: string;
  repository: string;
  category: string;
  tags: string[];
  type: PackageType;
  models: string[];
  latest_version: string;
  versions: string[];
  downloads: number;
  created_at: string;
  updated_at: string;
  dependencies?: {
    rules?: string[];
    plans?: string[];
  };
  variables?: Record<string, VariableDefinition>;
}

export interface VersionMetadata {
  version: string;
  published_at: string;
  source: {
    repository: string;
    tag: string;
    sha: string;
    path?: string;
  };
  files: string[];
  content_hash: string;
}

// ── Lockfile ──

export interface LockfileEntry {
  version: string;
  type: PackageType;
  source: string;
  tag: string;
  sha: string;
  content_hash: string;
  installed_to: string;
}

export interface Lockfile {
  lockfile_version: number;
  packages: Record<string, LockfileEntry>;
}

// ── Config ──

export interface PlanmodeConfig {
  auth?: {
    github_token?: string;
  };
  registries?: Record<string, string>;
  cache?: {
    dir?: string;
    ttl?: number;
  };
}

// ── Resolved package info ──

export interface ResolvedPackage {
  name: string;
  version: string;
  source: string;
  tag: string;
  sha: string;
  manifest: PackageManifest;
  content: string;
  contentHash: string;
}
