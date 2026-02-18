const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

let capturing = false;
let captured: string[] = [];

export const logger = {
  capture() {
    capturing = true;
    captured = [];
  },

  flush(): string[] {
    const messages = captured;
    captured = [];
    capturing = false;
    return messages;
  },

  isCapturing(): boolean {
    return capturing;
  },

  info(msg: string) {
    const text = `info ${msg}`;
    if (capturing) {
      captured.push(stripAnsi(text));
    } else {
      console.log(`${CYAN}info${RESET} ${msg}`);
    }
  },

  success(msg: string) {
    const text = `✓ ${msg}`;
    if (capturing) {
      captured.push(stripAnsi(text));
    } else {
      console.log(`${GREEN}✓${RESET} ${msg}`);
    }
  },

  warn(msg: string) {
    const text = `warn ${msg}`;
    if (capturing) {
      captured.push(stripAnsi(text));
    } else {
      console.log(`${YELLOW}warn${RESET} ${msg}`);
    }
  },

  error(msg: string) {
    const text = `error ${msg}`;
    if (capturing) {
      captured.push(stripAnsi(text));
    } else {
      console.error(`${RED}error${RESET} ${msg}`);
    }
  },

  dim(msg: string) {
    if (capturing) {
      captured.push(msg);
    } else {
      console.log(`${DIM}${msg}${RESET}`);
    }
  },

  bold(msg: string) {
    if (capturing) {
      captured.push(msg);
    } else {
      console.log(`${BOLD}${msg}${RESET}`);
    }
  },

  table(headers: string[], rows: string[][]) {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
    );

    const header = headers
      .map((h, i) => h.toUpperCase().padEnd(colWidths[i]!))
      .join("  ");

    if (capturing) {
      captured.push(`  ${header}`);
      for (const row of rows) {
        const line = row.map((cell, i) => cell.padEnd(colWidths[i]!)).join("  ");
        captured.push(`  ${line}`);
      }
    } else {
      console.log(`  ${DIM}${header}${RESET}`);
      for (const row of rows) {
        const line = row.map((cell, i) => cell.padEnd(colWidths[i]!)).join("  ");
        console.log(`  ${line}`);
      }
    }
  },

  blank() {
    if (capturing) {
      captured.push("");
    } else {
      console.log();
    }
  },
};
