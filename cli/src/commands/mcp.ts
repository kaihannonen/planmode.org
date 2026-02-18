import { Command } from "commander";
import { execSync } from "node:child_process";
import { logger } from "../lib/logger.js";

export const mcpCommand = new Command("mcp")
  .description("Manage MCP server registration with Claude Code");

mcpCommand
  .command("setup")
  .description("Register the planmode MCP server with Claude Code")
  .action(() => {
    try {
      execSync("claude mcp add --transport stdio planmode -- planmode-mcp", {
        stdio: "inherit",
      });
      logger.success("Planmode MCP server registered with Claude Code.");
      logger.dim("Claude Code can now use planmode tools directly.");
    } catch (err) {
      logger.error(
        "Failed to register MCP server. Make sure Claude Code CLI is installed.",
      );
      process.exit(1);
    }
  });

mcpCommand
  .command("remove")
  .description("Remove the planmode MCP server from Claude Code")
  .action(() => {
    try {
      execSync("claude mcp remove planmode", { stdio: "inherit" });
      logger.success("Planmode MCP server removed from Claude Code.");
    } catch (err) {
      logger.error(
        "Failed to remove MCP server. Make sure Claude Code CLI is installed.",
      );
      process.exit(1);
    }
  });
