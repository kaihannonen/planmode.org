import { Command } from "commander";
import { uninstallPackage } from "../lib/installer.js";
import { logger } from "../lib/logger.js";

export const uninstallCommand = new Command("uninstall")
  .description("Remove an installed package")
  .argument("<package>", "Package name")
  .action(async (packageName: string) => {
    try {
      logger.blank();
      await uninstallPackage(packageName);
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
