import { Command } from "commander";
import { searchPackages } from "../lib/registry.js";
import { logger } from "../lib/logger.js";

export const searchCommand = new Command("search")
  .description("Search the registry for packages")
  .argument("<query>", "Search query")
  .option("--type <type>", "Filter by type (prompt, rule, plan)")
  .option("--category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .action(async (query: string, options: { type?: string; category?: string; json?: boolean }) => {
    try {
      const results = await searchPackages(query, {
        type: options.type,
        category: options.category,
      });

      if (results.length === 0) {
        logger.info("No packages found matching your query.");
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      logger.blank();
      logger.table(
        ["name", "type", "version", "description"],
        results.map((pkg) => [
          pkg.name,
          pkg.type,
          pkg.version,
          pkg.description.length > 50
            ? pkg.description.slice(0, 50) + "..."
            : pkg.description,
        ]),
      );
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
