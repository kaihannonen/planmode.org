import * as p from "@clack/prompts";
import type { VariableDefinition } from "../types/index.js";

/**
 * Returns true if the CLI is running in an interactive terminal.
 * False when piped, in CI, or when --no-input is set.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

/**
 * Wraps a clack prompt result — if the user cancels (Ctrl+C),
 * prints a cancel message and exits cleanly.
 */
export function handleCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as T;
}

/**
 * Prompts for a single manifest variable using the appropriate clack widget.
 */
async function promptForVariable(
  name: string,
  def: VariableDefinition,
): Promise<string | number | boolean> {
  switch (def.type) {
    case "enum": {
      const value = await p.select({
        message: def.description || name,
        options: (def.options ?? []).map((opt) => ({
          value: opt,
          label: opt,
        })),
        initialValue: def.default !== undefined ? String(def.default) : undefined,
      });
      return handleCancel(value);
    }

    case "boolean": {
      const value = await p.confirm({
        message: def.description || name,
        initialValue: def.default !== undefined ? Boolean(def.default) : false,
      });
      return handleCancel(value);
    }

    case "number": {
      const value = await p.text({
        message: def.description || name,
        placeholder: def.default !== undefined ? String(def.default) : undefined,
        defaultValue: def.default !== undefined ? String(def.default) : undefined,
        validate(input) {
          if (isNaN(Number(input))) return "Must be a number";
        },
      });
      return Number(handleCancel(value));
    }

    case "string":
    default: {
      const value = await p.text({
        message: def.description || name,
        placeholder: def.default !== undefined ? String(def.default) : undefined,
        defaultValue: def.default !== undefined ? String(def.default) : undefined,
        validate(input) {
          if (def.required && !input) return `${name} is required`;
        },
      });
      return handleCancel(value);
    }
  }
}

/**
 * Collects all missing variable values interactively.
 * Merges with already-provided values.
 * Falls back to defaults or throws if not interactive.
 */
export async function promptForVariables(
  variableDefs: Record<string, VariableDefinition>,
  provided: Record<string, string>,
  noInput: boolean = false,
): Promise<Record<string, string | number | boolean>> {
  const values: Record<string, string | number | boolean> = {};

  for (const [name, def] of Object.entries(variableDefs)) {
    if (def.type === "resolved") continue;

    if (provided[name] !== undefined) {
      values[name] = coerceValue(provided[name]!, def);
    } else if (def.default !== undefined) {
      if (isInteractive() && !noInput) {
        // In interactive mode, let user confirm/change defaults
        values[name] = await promptForVariable(name, def);
      } else {
        values[name] = def.default;
      }
    } else if (def.required) {
      if (isInteractive() && !noInput) {
        values[name] = await promptForVariable(name, def);
      } else {
        throw new Error(`Missing required variable: ${name} -- ${def.description}`);
      }
    }
  }

  return values;
}

function coerceValue(
  raw: string,
  def: VariableDefinition,
): string | number | boolean {
  switch (def.type) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true" || raw === "1" || raw === "yes";
    case "enum":
      if (def.options && !def.options.includes(raw)) {
        throw new Error(
          `Invalid value "${raw}" for enum variable. Options: ${def.options.join(", ")}`,
        );
      }
      return raw;
    default:
      return raw;
  }
}

/**
 * Wraps an async operation with a clack spinner.
 * Only shows spinner when interactive.
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  successMessage?: string,
): Promise<T> {
  if (!isInteractive()) {
    return fn();
  }

  const s = p.spinner();
  s.start(message);
  try {
    const result = await fn();
    s.stop(successMessage ?? message);
    return result;
  } catch (err) {
    s.stop(`Failed: ${message}`);
    throw err;
  }
}
