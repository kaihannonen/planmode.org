import { Command } from "commander";
import { readLockfile } from "../lib/lockfile.js";
import { getEntryTargets } from "../lib/targets.js";
import { logger } from "../lib/logger.js";

export const listCommand = new Command("list")
  .description("List all installed packages")
  .action(() => {
    const lockfile = readLockfile();
    const entries = Object.entries(lockfile.packages);

    if (entries.length === 0) {
      logger.info("No packages installed. Run `planmode install <package>` to get started.");
      return;
    }

    logger.blank();
    logger.table(
      ["name", "type", "version", "targets", "location"],
      entries.map(([name, entry]) => [
        name,
        entry.type,
        entry.version,
        getEntryTargets(entry.targets).join(","),
        entry.installed_to,
      ]),
    );
    logger.blank();
  });
