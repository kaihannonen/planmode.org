import { Command } from "commander";
import { execSync } from "node:child_process";
import { setGitHubToken, getGitHubToken } from "../lib/config.js";
import { logger } from "../lib/logger.js";

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
    } else {
      // Interactive prompt via stdin
      const { createInterface } = await import("node:readline");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      token = await new Promise<string>((resolve) => {
        rl.question("GitHub personal access token: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }

    if (!token) {
      logger.error("No token provided.");
      process.exit(1);
    }

    // Validate token
    logger.info("Validating token...");
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "planmode-cli",
      },
    });

    if (!response.ok) {
      logger.error("Invalid token. GitHub API returned: " + response.status);
      process.exit(1);
    }

    const user = (await response.json()) as { login: string };
    setGitHubToken(token);
    logger.success(`Authenticated as ${user.login}`);
  });
