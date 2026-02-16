import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { logger } from "../lib/logger.js";
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
      const license = await prompt("License [MIT]: ") || "MIT";
      const tagsInput = await prompt("Tags (comma-separated): ");
      const tags = tagsInput ? tagsInput.split(",").map((t) => t.trim().toLowerCase()) : [];
      const category = (await prompt("Category (frontend/backend/devops/database/testing/mobile/ai-ml/security/other) [other]: ") || "other") as Category;

      // Build manifest
      const manifest: Record<string, unknown> = {
        name,
        version: "1.0.0",
        type,
        description,
        author,
        license,
      };

      if (tags.length > 0) manifest["tags"] = tags;
      manifest["category"] = category;

      const contentFile = `${type}.md`;
      manifest["content_file"] = contentFile;

      // Write planmode.yaml
      const yamlContent = stringify(manifest);
      fs.writeFileSync(path.join(process.cwd(), "planmode.yaml"), yamlContent, "utf-8");
      logger.success("Created planmode.yaml");

      // Write stub content file
      const stubs: Record<string, string> = {
        plan: `# ${name}\n\n1. First step\n2. Second step\n3. Third step\n`,
        rule: `- Rule one\n- Rule two\n- Rule three\n`,
        prompt: `Write your prompt here.\n\nUse {{variable_name}} for template variables.\n`,
      };

      fs.writeFileSync(
        path.join(process.cwd(), contentFile),
        stubs[type] ?? stubs["plan"]!,
        "utf-8",
      );
      logger.success(`Created ${contentFile}`);

      logger.blank();
      logger.info(`Edit ${contentFile}, then run \`planmode publish\` when ready.`);
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
