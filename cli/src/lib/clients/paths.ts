import path from "node:path";
import type { PackageType } from "../../types/index.js";

/**
 * Canonical, client-neutral install location. Adapters add client-specific
 * references on top of this file; they never move it.
 */
export function canonicalInstallPath(name: string, type: PackageType): string {
  switch (type) {
    case "plan":
      return path.join("plans", `${name}.md`);
    case "rule":
      // Kept for backwards compatibility with existing installs. A future
      // migration can move this to .planmode/rules without changing adapters.
      return path.join(".claude", "rules", `${name}.md`);
    case "prompt":
      return path.join("prompts", `${name}.md`);
  }
}
