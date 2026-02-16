import Handlebars from "handlebars";
import type { VariableDefinition } from "../types/index.js";

// Register helpers
Handlebars.registerHelper("eq", (a, b) => a === b);

export function renderTemplate(
  content: string,
  variables: Record<string, string | number | boolean>,
): string {
  const template = Handlebars.compile(content);
  return template(variables);
}

export function collectVariableValues(
  variableDefs: Record<string, VariableDefinition>,
  provided: Record<string, string>,
): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};

  for (const [name, def] of Object.entries(variableDefs)) {
    const rawValue = provided[name];

    if (rawValue !== undefined) {
      values[name] = coerceValue(rawValue, def);
    } else if (def.default !== undefined) {
      values[name] = def.default;
    } else if (def.required) {
      throw new Error(`Missing required variable: ${name} — ${def.description}`);
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

export async function resolveVariable(
  def: VariableDefinition,
  currentValues: Record<string, string | number | boolean>,
): Promise<string> {
  if (def.type !== "resolved" || !def.source) {
    throw new Error("resolveVariable called on non-resolved variable");
  }

  // Render the source URL with current variable values
  const sourceUrl = renderTemplate(def.source, currentValues);

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to resolve variable from ${sourceUrl}: ${response.status}`);
  }

  const data = await response.json();

  // Extract value using dot-bracket notation path
  if (def.extract) {
    return extractPath(data, def.extract);
  }

  return String(data);
}

function extractPath(obj: unknown, pathStr: string): string {
  const parts = pathStr.match(/[^.[\]]+/g);
  if (!parts) return String(obj);

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return "";
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return String(current ?? "");
}

export function getMissingRequiredVariables(
  variableDefs: Record<string, VariableDefinition>,
  provided: Record<string, string>,
): Array<{ name: string; def: VariableDefinition }> {
  const missing: Array<{ name: string; def: VariableDefinition }> = [];

  for (const [name, def] of Object.entries(variableDefs)) {
    if (def.required && provided[name] === undefined && def.default === undefined) {
      missing.push({ name, def });
    }
  }

  return missing;
}
