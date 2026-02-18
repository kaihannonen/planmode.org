import { Command } from "commander";
import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { takeSnapshot } from "../lib/snapshot.js";
import { logger } from "../lib/logger.js";
import { isInteractive, withSpinner } from "../lib/prompts.js";

export const snapshotCommand = new Command("snapshot")
  .description("Analyze the current project and generate a plan that recreates this setup")
  .option("--name <name>", "Package name (auto-inferred from project)")
  .option("--author <author>", "Author GitHub username")
  .option("--dir <dir>", "Output directory for the generated package (default: current directory)")
  .action(async (options: { name?: string; author?: string; dir?: string }) => {
    try {
      const interactive = isInteractive();

      if (interactive) {
        p.intro("Taking project snapshot");
      } else {
        logger.blank();
      }

      const doSnapshot = () => Promise.resolve(
        takeSnapshot(process.cwd(), {
          name: options.name,
          author: options.author,
        }),
      );

      const result = interactive
        ? await withSpinner("Analyzing project...", doSnapshot, "Analysis complete")
        : (() => {
            logger.info("Analyzing project...");
            return takeSnapshot(process.cwd(), {
              name: options.name,
              author: options.author,
            });
          })();

      // Write to output directory
      const outDir = options.dir ?? process.cwd();
      fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(path.join(outDir, "planmode.yaml"), result.manifestContent, "utf-8");
      fs.writeFileSync(path.join(outDir, "plan.md"), result.planContent, "utf-8");

      logger.blank();
      logger.success(`Snapshot: ${result.data.name}`);
      if (result.data.framework) {
        logger.dim(`  Framework: ${result.data.framework}`);
      }
      logger.dim(`  Dependencies: ${Object.keys(result.data.dependencies).length}`);
      logger.dim(`  Dev dependencies: ${Object.keys(result.data.devDependencies).length}`);
      logger.dim(`  Tools detected: ${result.data.detectedTools.map((t) => t.name).join(", ") || "none"}`);

      logger.blank();
      logger.success("Created planmode.yaml and plan.md");

      if (interactive) {
        p.outro("Edit the generated plan, then run `planmode test` to validate and `planmode publish` when ready.");
      } else {
        logger.dim("Edit the generated plan, then run `planmode test` to validate and `planmode publish` when ready.");
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
