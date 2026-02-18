import { Command } from "commander";
import * as p from "@clack/prompts";
import { publishPackage } from "../lib/publisher.js";
import { logger } from "../lib/logger.js";
import { isInteractive } from "../lib/prompts.js";

export const publishCommand = new Command("publish")
  .description("Publish the current directory as a package to the registry")
  .action(async () => {
    try {
      if (isInteractive()) {
        p.intro("Publishing package");
      } else {
        logger.blank();
      }

      const result = await publishPackage({ interactive: isInteractive() });

      if (isInteractive()) {
        p.outro(`Published ${result.packageName}@${result.version} — PR: ${result.prUrl}`);
      } else {
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
