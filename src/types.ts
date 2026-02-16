export interface PackageSummary {
  name: string;
  version: string;
  type: "prompt" | "rule" | "plan";
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

export interface Variable {
  description: string;
  type: "string" | "number" | "boolean" | "enum" | "resolved";
  options?: string[];
  required?: boolean;
  default?: string | number | boolean;
}

export interface PackageMetadata {
  name: string;
  description: string;
  author: string;
  license: string;
  repository: string;
  category: string;
  tags: string[];
  type: "prompt" | "rule" | "plan";
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
  variables?: Record<string, Variable>;
  content?: string;
}

export interface Category {
  id: string;
  label: string;
}
