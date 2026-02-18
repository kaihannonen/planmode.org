import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { parseManifest, readPackageContent } from "../lib/manifest.js";
import { renderTemplate, resolveVariable } from "../lib/template.js";
import { logger } from "../lib/logger.js";
import { isInteractive, promptForVariables } from "../lib/prompts.js";

export const runCommand = new Command("run")
  .description("Run a templated prompt and output to stdout")
  .argument("<prompt>", "Prompt package name")
  .option("--no-input", "Fail if any required variable is missing")
  .option("--json", "Output as JSON")
  .allowUnknownOption(true)
  .action(async (promptName: string, options: { input?: boolean; json?: boolean }, cmd: Command) => {
    try {
      // Parse dynamic --var flags from raw args
      const vars: Record<string, string> = {};
      const rawArgs = cmd.args.slice(0);
      for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i]!;
        if (arg.startsWith("--") && arg !== "--no-input" && arg !== "--json") {
          const key = arg.slice(2);
          const value = rawArgs[i + 1];
          if (value && !value.startsWith("--")) {
            vars[key] = value;
            i++;
          }
        }
      }

      // Look for prompt locally first
      const localPath = path.join(process.cwd(), "prompts", `${promptName}.md`);
      const localManifestPath = path.join(process.cwd(), "prompts", promptName, "planmode.yaml");

      let content: string;
      let manifest: ReturnType<typeof parseManifest> | undefined;

      if (fs.existsSync(localManifestPath)) {
        const raw = fs.readFileSync(localManifestPath, "utf-8");
        manifest = parseManifest(raw);
        const dir = path.join(process.cwd(), "prompts", promptName);
        content = readPackageContent(dir, manifest);
      } else if (fs.existsSync(localPath)) {
        content = fs.readFileSync(localPath, "utf-8");
      } else {
        logger.error(`Prompt '${promptName}' not found locally. Install it first: planmode install ${promptName}`);
        process.exit(1);
      }

      // Resolve variables
      if (manifest?.variables && Object.keys(manifest.variables).length > 0) {
        const noInput = options.input === false;

        // Collect non-resolved variables (interactive or from flags/defaults)
        const values = await promptForVariables(manifest.variables, vars, noInput);

        // Resolve dynamic variables
        for (const [name, def] of Object.entries(manifest.variables)) {
          if (def.type !== "resolved") continue;
          values[name] = await resolveVariable(def, values);
        }

        content = renderTemplate(content, values);

        if (options.json) {
          console.log(JSON.stringify({ rendered: content, variables: values }, null, 2));
          return;
        }
      }

      // Output rendered content
      process.stdout.write(content);
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });
