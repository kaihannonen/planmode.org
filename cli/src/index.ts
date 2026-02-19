import { Command } from "commander";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { searchCommand } from "./commands/search.js";
import { runCommand } from "./commands/run.js";
import { publishCommand } from "./commands/publish.js";
import { updateCommand } from "./commands/update.js";
import { listCommand } from "./commands/list.js";
import { infoCommand } from "./commands/info.js";
import { initCommand } from "./commands/init.js";
import { loginCommand } from "./commands/login.js";
import { mcpCommand } from "./commands/mcp.js";
import { doctorCommand } from "./commands/doctor.js";
import { testCommand } from "./commands/test.js";
import { recordCommand } from "./commands/record.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { contextCommand } from "./commands/context.js";
import { isInteractive } from "./lib/prompts.js";

const program = new Command();

program
  .name("planmode")
  .description("The open source package manager for AI plans, rules, and prompts.")
  .version("0.4.0");

program.addCommand(installCommand);
program.addCommand(uninstallCommand);
program.addCommand(searchCommand);
program.addCommand(runCommand);
program.addCommand(publishCommand);
program.addCommand(updateCommand);
program.addCommand(listCommand);
program.addCommand(infoCommand);
program.addCommand(initCommand);
program.addCommand(loginCommand);
program.addCommand(mcpCommand);
program.addCommand(doctorCommand);
program.addCommand(testCommand);
program.addCommand(recordCommand);
program.addCommand(snapshotCommand);
program.addCommand(contextCommand);

// If no args and interactive TTY, show the interactive menu
if (process.argv.length <= 2 && isInteractive()) {
  const { runInteractiveMenu } = await import("./commands/interactive.js");
  runInteractiveMenu();
} else {
  program.parse();
}
