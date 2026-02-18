import { Command } from "commander";
import * as p from "@clack/prompts";
import { updatePackage } from "../lib/installer.js";
import { readLockfile } from "../lib/lockfile.js";
import { logger } from "../lib/logger.js";
import { isInteractive, withSpinner } from "../lib/prompts.js";

export const updateCommand = new Command("update")
  .description("Update installed packages to latest compatible versions")
  .argument("[package]", "Package name (omit to update all)")
  .action(async (packageName?: string) => {
    try {
      const interactive = isInteractive();

      if (interactive) {
        p.intro("Updating packages");
      } else {
        logger.blank();
      }

      if (packageName) {
        const updated = interactive
          ? await withSpinner(
              `Checking ${packageName} for updates...`,
              () => updatePackage(packageName),
            )
          : await updatePackage(packageName);

        if (!updated) {
          if (interactive) {
            p.log.info("Already up to date.");
          } else {
            logger.info("Already up to date.");
          }
        }
      } else {
        const lockfile = readLockfile();
        const names = Object.keys(lockfile.packages);

        if (names.length === 0) {
          if (interactive) {
            p.log.info("No packages installed.");
          } else {
            logger.info("No packages installed.");
          }
          if (interactive) p.outro("Nothing to update.");
          return;
        }

        const doUpdate = async () => {
          let updatedCount = 0;
          for (const name of names) {
            try {
              const updated = await updatePackage(name);
              if (updated) updatedCount++;
            } catch (err) {
              logger.warn(`Failed to update ${name}: ${(err as Error).message}`);
            }
          }
          return updatedCount;
        };

        const updatedCount = interactive
          ? await withSpinner("Checking for updates...", doUpdate)
          : await doUpdate();

        if (updatedCount === 0) {
          if (interactive) {
            p.log.info("All packages are up to date.");
          } else {
            logger.info("All packages are up to date.");
          }
        } else {
          if (interactive) {
            p.log.success(`Updated ${updatedCount} package${updatedCount > 1 ? "s" : ""}.`);
          } else {
            logger.success(`Updated ${updatedCount} package${updatedCount > 1 ? "s" : ""}.`);
          }
        }
      }

      if (interactive) {
        p.outro("Done!");
      } else {
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
