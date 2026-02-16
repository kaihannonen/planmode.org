const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

export const logger = {
  info(msg: string) {
    console.log(`${CYAN}info${RESET} ${msg}`);
  },

  success(msg: string) {
    console.log(`${GREEN}✓${RESET} ${msg}`);
  },

  warn(msg: string) {
    console.log(`${YELLOW}warn${RESET} ${msg}`);
  },

  error(msg: string) {
    console.error(`${RED}error${RESET} ${msg}`);
  },

  dim(msg: string) {
    console.log(`${DIM}${msg}${RESET}`);
  },

  bold(msg: string) {
    console.log(`${BOLD}${msg}${RESET}`);
  },

  table(headers: string[], rows: string[][]) {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
    );

    const header = headers
      .map((h, i) => h.toUpperCase().padEnd(colWidths[i]!))
      .join("  ");
    console.log(`  ${DIM}${header}${RESET}`);

    for (const row of rows) {
      const line = row.map((cell, i) => cell.padEnd(colWidths[i]!)).join("  ");
      console.log(`  ${line}`);
    }
  },

  blank() {
    console.log();
  },
};
