# Vitest Setup

Configure Vitest for a TypeScript project with code coverage, path aliases, and sensible defaults.

## Prerequisites

- Node.js >= 18
- An existing TypeScript project with `tsconfig.json`
- A package manager (npm, pnpm, or yarn)

## Steps

### 1. Install Vitest and related packages

```bash
npm install -D vitest @vitest/coverage-v8 @vitest/ui
```

If you are testing code that uses DOM APIs (React, Vue, Svelte, etc.):

```bash
npm install -D jsdom @testing-library/jest-dom
```

### 2. Create the Vitest configuration

Create `vitest.config.ts` in the project root:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Global test settings
    globals: true,
    environment: "node", // Change to "jsdom" for browser-like testing

    // File patterns
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".git", "coverage"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/*.d.ts",
        "src/**/index.ts",  // barrel files
        "src/types/**",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporter
    reporters: ["default"],

    // Setup files (runs before each test file)
    // setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 3. Add test scripts to package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch"
  }
}
```

### 4. Create a test setup file (optional)

If you need global setup (e.g., for DOM testing), create `tests/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";

// Add any global test setup here
// For example, reset mocks between tests:
afterEach(() => {
  vi.restoreAllMocks();
});
```

Then uncomment the `setupFiles` line in `vitest.config.ts`.

### 5. Create a sample test

Create `src/utils/example.ts`:

```typescript
export function add(a: number, b: number): number {
  return a + b;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Create `src/utils/example.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { add, slugify } from "./example";

describe("add", () => {
  it("adds two positive numbers", () => {
    expect(add(1, 2)).toBe(3);
  });

  it("handles negative numbers", () => {
    expect(add(-1, -2)).toBe(-3);
  });

  it("handles zero", () => {
    expect(add(0, 5)).toBe(5);
  });
});

describe("slugify", () => {
  it("converts text to a URL-safe slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("handles special characters", () => {
    expect(slugify("Hello, World! #2025")).toBe("hello-world-2025");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });
});
```

### 6. Configure TypeScript for Vitest globals

If using `globals: true`, add Vitest types to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

### 7. Add coverage output to .gitignore

Add to `.gitignore`:

```
coverage/
```

### 8. Run the tests

```bash
# Run all tests once
npm run test:run

# Run tests in watch mode during development
npm test

# Generate coverage report
npm run test:coverage

# Open the visual UI
npm run test:ui
```

## What you get

- Vitest configured with TypeScript support
- Code coverage via V8 with 80% thresholds
- Path alias support (`@/` maps to `src/`)
- Watch mode for development
- Visual UI for interactive test exploration
- Sample test as a starting point
