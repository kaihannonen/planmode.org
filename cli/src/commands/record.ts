import { Command } from "commander";
import * as p from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import { startRecordingAsync, stopRecording, isRecording } from "../lib/recorder.js";
import { logger } from "../lib/logger.js";
import { isInteractive, withSpinner } from "../lib/prompts.js";

export const recordCommand = new Command("record")
  .description("Record git activity and generate a plan from commits");

recordCommand
  .command("start")
  .description("Start recording — saves current HEAD as the starting point")
  .action(async () => {
    try {
      logger.blank();
      const sha = await startRecordingAsync();
      logger.success(`Recording started at ${sha.slice(0, 7)}`);
      logger.dim("Work normally. When done, run `planmode record stop` to generate a plan.");
      logger.blank();
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

recordCommand
  .command("stop")
  .description("Stop recording and generate a plan from commits since start")
  .option("--name <name>", "Package name (auto-inferred if not provided)")
  .option("--author <author>", "Author GitHub username")
  .option("--dir <dir>", "Output directory for the generated package (default: current directory)")
  .action(async (options: { name?: string; author?: string; dir?: string }) => {
    try {
      const interactive = isInteractive();

      if (interactive) {
        p.intro("Generating plan from recording");
      } else {
        logger.blank();
      }

      const result = interactive
        ? await withSpinner(
            "Analyzing commits...",
            () => stopRecording(process.cwd(), {
              name: options.name,
              author: options.author,
            }),
            "Analysis complete",
          )
        : await (async () => {
            logger.info("Analyzing commits...");
            return stopRecording(process.cwd(), {
              name: options.name,
              author: options.author,
            });
          })();

      // Write to output directory
      const outDir = options.dir ?? process.cwd();
      fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(path.join(outDir, "planmode.yaml"), result.manifestContent, "utf-8");
      fs.writeFileSync(path.join(outDir, "plan.md"), result.planContent, "utf-8");

      logger.success(`Generated plan from ${result.totalCommits} commit(s) (${result.totalFilesChanged} files changed)`);
      logger.blank();

      for (let i = 0; i < result.steps.length; i++) {
        const step = result.steps[i]!;
        logger.dim(`  ${i + 1}. ${step.title} (${step.filesChanged.length} files)`);
      }

      logger.blank();
      logger.success("Created planmode.yaml and plan.md");

      if (interactive) {
        p.outro("Edit the generated plan, then run `planmode test` to validate and `planmode publish` when ready.");
      } else {
        logger.dim("Edit the generated plan, then run `planmode test` to validate and `planmode publish` when ready.");
        logger.blank();
      }
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }
  });

recordCommand
  .command("status")
  .description("Check if a recording is in progress")
  .action(() => {
    if (isRecording()) {
      logger.info("Recording is in progress. Run `planmode record stop` to generate a plan.");
    } else {
      logger.info("No recording in progress.");
    }
  });
