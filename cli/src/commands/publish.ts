import { Command } from "commander";
import { publishPackage } from "../lib/publisher.js";
import { logger } from "../lib/logger.js";

export const publishCommand = new Command("publish")
  .description("Publish the current directory as a package to the registry")
  .action(async () => {
    try {
      logger.blank();
      const result = await publishPackage();
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
