import { Command } from "commander";
import * as p from "@clack/prompts";
import { execSync } from "node:child_process";
import { setGitHubToken, getGitHubToken } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { isInteractive, handleCancel, withSpinner } from "../lib/prompts.js";

export const loginCommand = new Command("login")
  .description("Configure GitHub authentication")
  .option("--token <token>", "GitHub personal access token")
  .option("--gh", "Read token from GitHub CLI (gh auth token)")
  .action(async (options: { token?: string; gh?: boolean }) => {
    let token: string | undefined;

    if (options.token) {
      token = options.token;
    } else if (options.gh) {
      try {
        token = execSync("gh auth token", { encoding: "utf-8" }).trim();
      } catch {
        logger.error("Failed to read token from GitHub CLI. Make sure `gh` is installed and authenticated.");
        process.exit(1);
      }
    } else if (isInteractive()) {
      p.intro("planmode login");
      const value = await p.password({
        message: "GitHub personal access token:",
        validate(input) {
          if (!input) return "Token is required";
        },
      });
      token = handleCancel(value);
    } else {
      logger.error("No token provided. Use --token <token> or --gh.");
      process.exit(1);
    }

    if (!token) {
      logger.error("No token provided.");
      process.exit(1);
    }

    // Validate token
    const validateToken = async () => {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "planmode-cli",
        },
      });

      if (!response.ok) {
        throw new Error("Invalid token. GitHub API returned: " + response.status);
      }

      return (await response.json()) as { login: string };
    };

    try {
      const user = await withSpinner(
        "Validating token...",
        validateToken,
        "Token validated",
      );

      setGitHubToken(token);

      if (isInteractive()) {
        p.log.success(`Authenticated as ${user.login}`);
        p.outro("You're all set!");
      } else {
        logger.success(`Authenticated as ${user.login}`);
      }
    } catch (err) {
      if (isInteractive()) {
        p.log.error((err as Error).message);
        p.outro("Authentication failed.");
      } else {
        logger.error((err as Error).message);
      }
      process.exit(1);
    }
  });
