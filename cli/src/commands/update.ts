import { Command } from "commander";
import { updatePackage } from "../lib/installer.js";
import { readLockfile } from "../lib/lockfile.js";
import { logger } from "../lib/logger.js";

export const updateCommand = new Command("update")
  .description("Update installed packages to latest compatible versions")
  .argument("[package]", "Package name (omit to update all)")
  .action(async (packageName?: string) => {
    try {
      logger.blank();

      if (packageName) {
        const updated = await updatePackage(packageName);
        if (!updated) {
          logger.info("Already up to date.");
        }
      } else {
        const lockfile = readLockfile();
        const names = Object.keys(lockfile.packages);

        if (names.length === 0) {
          logger.info("No packages installed.");
          return;
        }

        let updatedCount = 0;
        for (const name of names) {
          try {
            const updated = await updatePackage(name);
            if (updated) updatedCount++;
          } catch (err) {
            logger.warn(`Failed to update ${name}: ${(err as Error).message}`);
          }
        }

        if (updatedCount === 0) {
          logger.info("All packages are up to date.");
        } else {
          logger.success(`Updated ${updatedCount} package${updatedCount > 1 ? "s" : ""}.`);
        }
      }

      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
