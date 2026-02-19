import { describe, it, expect, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

afterEach(() => {
  // Ensure capture mode is off after each test
  if (logger.isCapturing()) {
    logger.flush();
  }
});

// ── capture mode ──

describe("logger capture mode", () => {
  it("enables and disables capture", () => {
    expect(logger.isCapturing()).toBe(false);
    logger.capture();
    expect(logger.isCapturing()).toBe(true);
    logger.flush();
    expect(logger.isCapturing()).toBe(false);
  });

  it("returns captured messages on flush", () => {
    logger.capture();
    logger.info("hello");
    logger.success("done");
    const messages = logger.flush();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("hello");
    expect(messages[1]).toContain("done");
  });

  it("clears buffer on flush", () => {
    logger.capture();
    logger.info("first");
    logger.flush();
    logger.capture();
    const messages = logger.flush();
    expect(messages).toHaveLength(0);
  });

  it("strips ANSI codes in captured output", () => {
    logger.capture();
    logger.info("test");
    const messages = logger.flush();
    // Should not contain escape sequences
    expect(messages[0]).not.toMatch(/\x1b/);
  });
});

// ── message methods ──

describe("logger message methods", () => {
  it("info captures with 'info' prefix", () => {
    logger.capture();
    logger.info("test message");
    const [msg] = logger.flush();
    expect(msg).toBe("info test message");
  });

  it("success captures with checkmark prefix", () => {
    logger.capture();
    logger.success("completed");
    const [msg] = logger.flush();
    expect(msg).toBe("✓ completed");
  });

  it("warn captures with 'warn' prefix", () => {
    logger.capture();
    logger.warn("be careful");
    const [msg] = logger.flush();
    expect(msg).toBe("warn be careful");
  });

  it("error captures with 'error' prefix", () => {
    logger.capture();
    logger.error("something failed");
    const [msg] = logger.flush();
    expect(msg).toBe("error something failed");
  });

  it("blank captures an empty string", () => {
    logger.capture();
    logger.blank();
    const [msg] = logger.flush();
    expect(msg).toBe("");
  });
});

// ── table ──

describe("logger table", () => {
  it("captures formatted table with headers and rows", () => {
    logger.capture();
    logger.table(["Name", "Type"], [["foo", "plan"], ["bar", "rule"]]);
    const messages = logger.flush();
    expect(messages.length).toBe(3); // header + 2 rows
    expect(messages[0]).toContain("NAME");
    expect(messages[0]).toContain("TYPE");
    expect(messages[1]).toContain("foo");
    expect(messages[1]).toContain("plan");
    expect(messages[2]).toContain("bar");
    expect(messages[2]).toContain("rule");
  });

  it("pads columns to align text", () => {
    logger.capture();
    logger.table(["A", "B"], [["short", "x"], ["longer-text", "y"]]);
    const messages = logger.flush();
    // Header and rows should have consistent padding
    expect(messages).toHaveLength(3);
    // The longer-text determines column width
    expect(messages[1]).toContain("short");
    expect(messages[2]).toContain("longer-text");
  });
});
