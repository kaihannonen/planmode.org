import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderTemplate,
  collectVariableValues,
  getMissingRequiredVariables,
  resolveVariable,
} from "../../src/lib/template.js";
import type { VariableDefinition } from "../../src/types/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ── renderTemplate ──

describe("renderTemplate", () => {
  it("substitutes a single variable", () => {
    expect(renderTemplate("Hello {{name}}", { name: "World" })).toBe("Hello World");
  });

  it("substitutes multiple variables", () => {
    const result = renderTemplate("{{greeting}} {{name}}!", { greeting: "Hi", name: "Kai" });
    expect(result).toBe("Hi Kai!");
  });

  it("leaves unresolved variables as empty strings", () => {
    const result = renderTemplate("Hello {{name}}", {});
    expect(result).toBe("Hello ");
  });

  it("handles conditionals with #if", () => {
    const tpl = "Start{{#if debug}} [DEBUG]{{/if}} End";
    expect(renderTemplate(tpl, { debug: true })).toBe("Start [DEBUG] End");
    expect(renderTemplate(tpl, { debug: false })).toBe("Start End");
  });

  it("handles the eq helper", () => {
    const tpl = "{{#if (eq mode \"dark\")}}dark{{else}}light{{/if}}";
    expect(renderTemplate(tpl, { mode: "dark" })).toBe("dark");
    expect(renderTemplate(tpl, { mode: "light" })).toBe("light");
  });

  it("handles #each loops", () => {
    const tpl = "{{#each items}}{{this}} {{/each}}";
    // Handlebars #each works with arrays — we pass as a variable
    const compiled = renderTemplate(tpl, { items: ["a", "b", "c"] as any });
    expect(compiled).toBe("a b c ");
  });

  it("renders number and boolean variables", () => {
    expect(renderTemplate("Count: {{n}}", { n: 42 })).toBe("Count: 42");
    expect(renderTemplate("Flag: {{f}}", { f: true })).toBe("Flag: true");
  });
});

// ── collectVariableValues ──

describe("collectVariableValues", () => {
  it("uses provided values", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string" },
    };
    const result = collectVariableValues(defs, { name: "foo" });
    expect(result).toEqual({ name: "foo" });
  });

  it("falls back to defaults", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", default: "default-val" },
    };
    const result = collectVariableValues(defs, {});
    expect(result).toEqual({ name: "default-val" });
  });

  it("throws on missing required variable without default", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", required: true },
    };
    expect(() => collectVariableValues(defs, {})).toThrow("Missing required variable: name");
  });

  it("coerces number type", () => {
    const defs: Record<string, VariableDefinition> = {
      count: { description: "Count", type: "number" },
    };
    const result = collectVariableValues(defs, { count: "42" });
    expect(result.count).toBe(42);
  });

  it("coerces boolean type", () => {
    const defs: Record<string, VariableDefinition> = {
      flag: { description: "Flag", type: "boolean" },
    };
    expect(collectVariableValues(defs, { flag: "true" }).flag).toBe(true);
    expect(collectVariableValues(defs, { flag: "1" }).flag).toBe(true);
    expect(collectVariableValues(defs, { flag: "yes" }).flag).toBe(true);
    expect(collectVariableValues(defs, { flag: "false" }).flag).toBe(false);
    expect(collectVariableValues(defs, { flag: "no" }).flag).toBe(false);
  });

  it("validates enum values", () => {
    const defs: Record<string, VariableDefinition> = {
      mode: { description: "Mode", type: "enum", options: ["a", "b"] },
    };
    expect(collectVariableValues(defs, { mode: "a" }).mode).toBe("a");
    expect(() => collectVariableValues(defs, { mode: "c" })).toThrow("Invalid value");
  });

  it("skips optional variables without default when not provided", () => {
    const defs: Record<string, VariableDefinition> = {
      opt: { description: "Optional", type: "string" },
    };
    const result = collectVariableValues(defs, {});
    expect(result).toEqual({});
  });

  it("provided values override defaults", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", default: "default" },
    };
    const result = collectVariableValues(defs, { name: "override" });
    expect(result.name).toBe("override");
  });
});

// ── getMissingRequiredVariables ──

describe("getMissingRequiredVariables", () => {
  it("returns empty when all required variables are provided", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", required: true },
    };
    expect(getMissingRequiredVariables(defs, { name: "foo" })).toHaveLength(0);
  });

  it("returns missing required variables", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", required: true },
      age: { description: "Age", type: "number", required: true },
    };
    const missing = getMissingRequiredVariables(defs, { name: "foo" });
    expect(missing).toHaveLength(1);
    expect(missing[0]!.name).toBe("age");
  });

  it("does not report required variables that have defaults", () => {
    const defs: Record<string, VariableDefinition> = {
      name: { description: "Name", type: "string", required: true, default: "fallback" },
    };
    expect(getMissingRequiredVariables(defs, {})).toHaveLength(0);
  });

  it("does not report optional variables", () => {
    const defs: Record<string, VariableDefinition> = {
      opt: { description: "Optional", type: "string" },
    };
    expect(getMissingRequiredVariables(defs, {})).toHaveLength(0);
  });

  it("returns empty when no variables defined", () => {
    expect(getMissingRequiredVariables({}, {})).toHaveLength(0);
  });
});

// ── resolveVariable ──

describe("resolveVariable", () => {
  it("throws for non-resolved variable", async () => {
    const def: VariableDefinition = { description: "X", type: "string" };
    await expect(resolveVariable(def, {})).rejects.toThrow("non-resolved variable");
  });

  it("fetches data from source URL", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve("sunny") };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const def: VariableDefinition = {
      description: "Weather",
      type: "resolved",
      source: "https://api.example.com/weather",
    };
    const result = await resolveVariable(def, {});
    expect(result).toBe("sunny");
    expect(fetch).toHaveBeenCalledWith("https://api.example.com/weather");
  });

  it("extracts nested path from response", async () => {
    const data = { current: { condition: { text: "Cloudy" } } };
    const mockResponse = { ok: true, json: () => Promise.resolve(data) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const def: VariableDefinition = {
      description: "Weather",
      type: "resolved",
      source: "https://api.example.com/weather",
      extract: "current.condition.text",
    };
    const result = await resolveVariable(def, {});
    expect(result).toBe("Cloudy");
  });

  it("extracts array index from response", async () => {
    const data = { items: ["first", "second"] };
    const mockResponse = { ok: true, json: () => Promise.resolve(data) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const def: VariableDefinition = {
      description: "Item",
      type: "resolved",
      source: "https://api.example.com/data",
      extract: "items[0]",
    };
    const result = await resolveVariable(def, {});
    expect(result).toBe("first");
  });

  it("renders template variables in source URL", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve("result") };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const def: VariableDefinition = {
      description: "Data",
      type: "resolved",
      source: "https://api.example.com/{{city}}",
    };
    await resolveVariable(def, { city: "Helsinki" });
    expect(fetch).toHaveBeenCalledWith("https://api.example.com/Helsinki");
  });

  it("throws on HTTP error", async () => {
    const mockResponse = { ok: false, status: 404 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const def: VariableDefinition = {
      description: "Data",
      type: "resolved",
      source: "https://api.example.com/missing",
    };
    await expect(resolveVariable(def, {})).rejects.toThrow("404");
  });
});
