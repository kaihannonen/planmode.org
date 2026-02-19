import { Command } from "commander";
import * as p from "@clack/prompts";
import { addContextRepo, removeContextRepo, reindexContext, getContextSummary, formatSize } from "../lib/context.js";
import { logger } from "../lib/logger.js";
import { isInteractive, withSpinner } from "../lib/prompts.js";

export const contextCommand = new Command("context")
  .description("Manage project document context for AI");

contextCommand
  .command("add <path>")
  .description("Add a document directory to the project context")
  .option("--name <name>", "Human-readable label for this directory")
  .action(async (dirPath: string, options: { name?: string }) => {
    try {
      const interactive = isInteractive();

      if (interactive) {
        await withSpinner(
          "Indexing documents...",
          async () => addContextRepo(dirPath, { name: options.name }),
          "Indexing complete",
        );
      } else {
        logger.blank();
        addContextRepo(dirPath, { name: options.name });
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

contextCommand
  .command("remove <path-or-name>")
  .description("Remove a directory from the project context")
  .action((pathOrName: string) => {
    try {
      logger.blank();
      removeContextRepo(pathOrName);
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

contextCommand
  .command("list")
  .description("Show all directories in the project context")
  .option("--json", "Output as JSON")
  .action((options: { json?: boolean }) => {
    try {
      const summary = getContextSummary();

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      logger.blank();

      if (summary.totalRepos === 0) {
        logger.info("No context repos configured. Run `planmode context add <path>` to add one.");
        logger.blank();
        return;
      }

      logger.bold(`${summary.totalRepos} context repo(s) — ${summary.totalFiles} file(s), ${formatSize(summary.totalSize)}`);
      logger.blank();

      for (const repo of summary.repos) {
        logger.info(`${repo.name}`);
        logger.dim(`  Path: ${repo.path}`);
        logger.dim(`  Files: ${repo.fileCount} (${formatSize(repo.totalSize)})`);
        if (repo.typeBreakdown.length > 0) {
          logger.dim(`  Types: ${repo.typeBreakdown.join(", ")}`);
        }
        logger.dim(`  Indexed: ${repo.indexedAt}`);
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

contextCommand
  .command("reindex [path-or-name]")
  .description("Re-scan files in one or all context directories")
  .action(async (pathOrName?: string) => {
    try {
      const interactive = isInteractive();

      if (interactive) {
        await withSpinner(
          "Re-scanning documents...",
          async () => reindexContext(pathOrName),
          "Reindex complete",
        );
      } else {
        logger.blank();
        reindexContext(pathOrName);
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
