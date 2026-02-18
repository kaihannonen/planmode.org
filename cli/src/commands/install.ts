import { Command } from "commander";
import * as p from "@clack/prompts";
import { installPackage } from "../lib/installer.js";
import { logger } from "../lib/logger.js";
import { isInteractive } from "../lib/prompts.js";

function parseVariables(pairs: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new Error(`Invalid variable format: "${pair}". Use --set key=value`);
    }
    vars[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return vars;
}

export const installCommand = new Command("install")
  .description("Install a package into the current project")
  .argument("<package>", "Package name (e.g., nextjs-tailwind-starter)")
  .option("-v, --version <version>", "Install specific version")
  .option("--rule", "Force install as a rule to .claude/rules/")
  .option("--no-input", "Fail if any required variable is missing")
  .option("--set <key=value...>", "Set template variables (e.g., --set project_name=myapp)")
  .action(
    async (
      packageName: string,
      options: { version?: string; rule?: boolean; input?: boolean; set?: string[] },
    ) => {
      try {
        const interactive = isInteractive() && options.input !== false;
        const variables = options.set ? parseVariables(options.set) : undefined;

        if (interactive) {
          p.intro(`Installing ${packageName}`);
        } else {
          logger.blank();
        }

        await installPackage(packageName, {
          version: options.version,
          forceRule: options.rule,
          noInput: options.input === false,
          variables,
          interactive,
        });

        if (interactive) {
          p.outro("Done!");
        } else {
          logger.blank();
        }
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    },
  );
