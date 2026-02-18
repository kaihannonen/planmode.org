import { Command } from "commander";
import { logger } from "../lib/logger.js";
import { createPackage } from "../lib/init.js";
import type { PackageType, Category } from "../types/index.js";

async function prompt(question: string): Promise<string> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const initCommand = new Command("init")
  .description("Initialize a new package in the current directory")
  .action(async () => {
    try {
      logger.blank();
      logger.bold("Initialize a new Planmode package");
      logger.blank();

      const name = await prompt("Package name: ");
      if (!name) {
        logger.error("Package name is required.");
        process.exit(1);
      }

      const typeInput = await prompt("Type (plan/rule/prompt) [plan]: ");
      const type = (typeInput || "plan") as PackageType;

      const description = await prompt("Description: ");
      const author = await prompt("Author (GitHub username): ");
      const license = (await prompt("License [MIT]: ")) || "MIT";
      const tagsInput = await prompt("Tags (comma-separated): ");
      const tags = tagsInput
        ? tagsInput.split(",").map((t) => t.trim().toLowerCase())
        : [];
      const category =
        ((await prompt(
          "Category (frontend/backend/devops/database/testing/mobile/ai-ml/security/other) [other]: ",
        )) || "other") as Category;

      const result = createPackage({
        name,
        type,
        description,
        author,
        license,
        tags,
        category,
      });

      logger.success(`Created ${result.files.join(", ")}`);
      logger.blank();
      logger.info(
        `Edit ${result.files[1]}, then run \`planmode publish\` when ready.`,
      );
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
