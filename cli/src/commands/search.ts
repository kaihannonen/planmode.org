import { Command } from "commander";
import * as p from "@clack/prompts";
import { searchPackages, fetchPackageMetadata } from "../lib/registry.js";
import { installPackage } from "../lib/installer.js";
import { logger } from "../lib/logger.js";
import { isInteractive, handleCancel, withSpinner } from "../lib/prompts.js";

export const searchCommand = new Command("search")
  .description("Search the registry for packages")
  .argument("<query>", "Search query")
  .option("--type <type>", "Filter by type (prompt, rule, plan)")
  .option("--category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .action(async (query: string, options: { type?: string; category?: string; json?: boolean }) => {
    try {
      const results = await withSpinner(
        "Searching registry...",
        () => searchPackages(query, {
          type: options.type,
          category: options.category,
        }),
      );

      if (results.length === 0) {
        if (isInteractive() && !options.json) {
          p.log.warn("No packages found matching your query.");
        } else {
          logger.info("No packages found matching your query.");
        }
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Non-interactive: just show the table
      if (!isInteractive()) {
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
        return;
      }

      // Interactive: let user select a package
      const selected = handleCancel(
        await p.select({
          message: `Found ${results.length} package(s). Select one:`,
          options: [
            ...results.map((pkg) => ({
              value: pkg.name,
              label: `${pkg.name} (${pkg.type} v${pkg.version})`,
              hint: pkg.description.length > 60
                ? pkg.description.slice(0, 60) + "..."
                : pkg.description,
            })),
            { value: "__none__", label: "Cancel" },
          ],
        }),
      );

      if (selected === "__none__") return;

      const action = handleCancel(
        await p.select({
          message: `${selected}:`,
          options: [
            { value: "install", label: "Install" },
            { value: "details", label: "View details" },
            { value: "back", label: "Cancel" },
          ],
        }),
      );

      if (action === "install") {
        try {
          await installPackage(selected, { interactive: true });
          p.log.success(`Installed ${selected}`);
        } catch (err) {
          p.log.error((err as Error).message);
        }
      } else if (action === "details") {
        const meta = await withSpinner(
          "Fetching package details...",
          () => fetchPackageMetadata(selected),
        );
        const lines = [
          `Type:        ${meta.type}`,
          `Author:      ${meta.author}`,
          `License:     ${meta.license}`,
          `Category:    ${meta.category}`,
          `Downloads:   ${meta.downloads.toLocaleString()}`,
          `Versions:    ${meta.versions.join(", ")}`,
          `Repository:  ${meta.repository}`,
        ];
        if (meta.tags?.length) {
          lines.push(`Tags:        ${meta.tags.join(", ")}`);
        }
        p.note(lines.join("\n"), `${meta.name}@${meta.latest_version}`);
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
