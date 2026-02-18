import { Command } from "commander";
import * as p from "@clack/prompts";
import { logger } from "../lib/logger.js";
import { createPackage } from "../lib/init.js";
import { isInteractive, handleCancel } from "../lib/prompts.js";
import type { PackageType, Category } from "../types/index.js";

const CATEGORIES: Category[] = [
  "frontend",
  "backend",
  "devops",
  "database",
  "testing",
  "mobile",
  "ai-ml",
  "design",
  "security",
  "other",
];

export async function initInteractive(): Promise<void> {
  p.intro("Create a new planmode package");

  const result = await p.group(
    {
      name: () =>
        p.text({
          message: "Package name",
          placeholder: "my-awesome-plan",
          validate(input) {
            if (!input) return "Package name is required";
            if (!/^[a-z0-9][a-z0-9-]*$/.test(input))
              return "Lowercase letters, numbers, and hyphens only";
          },
        }),
      type: () =>
        p.select<PackageType>({
          message: "Package type",
          options: [
            { value: "plan" as PackageType, label: "Plan", hint: "multi-step implementation guide" },
            { value: "rule" as PackageType, label: "Rule", hint: "always-on coding constraint" },
            { value: "prompt" as PackageType, label: "Prompt", hint: "single-use templated prompt" },
          ],
        }),
      description: () =>
        p.text({
          message: "Description",
          placeholder: "A short description of what this package does",
        }),
      author: () =>
        p.text({
          message: "Author (GitHub username)",
          placeholder: "username",
        }),
      license: () =>
        p.text({
          message: "License",
          defaultValue: "MIT",
          placeholder: "MIT",
        }),
      category: () =>
        p.select<Category>({
          message: "Category",
          options: CATEGORIES.map((cat) => ({ value: cat as Category, label: cat })),
          initialValue: "other" as Category,
        }),
      tags: () =>
        p.text({
          message: "Tags (comma-separated)",
          placeholder: "nextjs, tailwind, starter",
        }),
    },
    {
      onCancel() {
        p.cancel("Cancelled.");
        process.exit(0);
      },
    },
  );

  const tags = result.tags
    ? result.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const output = createPackage({
    name: result.name,
    type: result.type,
    description: result.description ?? "",
    author: result.author ?? "",
    license: result.license || "MIT",
    tags,
    category: result.category,
  });

  p.log.success(`Created ${output.files.join(", ")}`);
  p.outro(`Edit ${output.files[1]}, then run \`planmode publish\` when ready.`);
}

export const initCommand = new Command("init")
  .description("Initialize a new package in the current directory")
  .action(async () => {
    try {
      if (isInteractive()) {
        await initInteractive();
      } else {
        // Non-interactive fallback: require all fields via env or fail
        logger.error("Interactive terminal required for `planmode init`. Use a TTY.");
        process.exit(1);
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
