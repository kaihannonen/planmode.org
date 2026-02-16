import { Command } from "commander";
import { fetchPackageMetadata } from "../lib/registry.js";
import { logger } from "../lib/logger.js";

export const infoCommand = new Command("info")
  .description("Show detailed info about a package")
  .argument("<package>", "Package name")
  .action(async (packageName: string) => {
    try {
      const meta = await fetchPackageMetadata(packageName);

      logger.blank();
      logger.bold(`${meta.name}@${meta.latest_version}`);
      logger.blank();

      console.log(`  Description:  ${meta.description}`);
      console.log(`  Type:         ${meta.type}`);
      console.log(`  Author:       ${meta.author}`);
      console.log(`  License:      ${meta.license}`);
      console.log(`  Category:     ${meta.category}`);
      console.log(`  Downloads:    ${meta.downloads.toLocaleString()}`);
      console.log(`  Repository:   ${meta.repository}`);

      if (meta.models && meta.models.length > 0) {
        console.log(`  Models:       ${meta.models.join(", ")}`);
      }

      if (meta.tags && meta.tags.length > 0) {
        console.log(`  Tags:         ${meta.tags.join(", ")}`);
      }

      console.log(`  Versions:     ${meta.versions.join(", ")}`);

      if (meta.dependencies) {
        if (meta.dependencies.rules && meta.dependencies.rules.length > 0) {
          console.log(`  Dep (rules):  ${meta.dependencies.rules.join(", ")}`);
        }
        if (meta.dependencies.plans && meta.dependencies.plans.length > 0) {
          console.log(`  Dep (plans):  ${meta.dependencies.plans.join(", ")}`);
        }
      }

      if (meta.variables) {
        logger.blank();
        logger.bold("  Variables:");
        for (const [name, def] of Object.entries(meta.variables)) {
          const required = def.required ? " (required)" : "";
          const defaultVal = def.default !== undefined ? ` [default: ${def.default}]` : "";
          console.log(`    ${name}: ${def.type}${required}${defaultVal} — ${def.description}`);
          if (def.options) {
            console.log(`      options: ${def.options.join(", ")}`);
          }
        }
      }

      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
