export function getPlanTemplate(name: string): string {
  return `# ${name}

## Prerequisites

- List any tools, dependencies, or setup required before starting

## Steps

1. **Step one** — Description of what to do first
2. **Step two** — Description of what to do next
3. **Step three** — Description of the final step

## Verification

- [ ] Verify step one completed successfully
- [ ] Verify step two completed successfully
- [ ] Verify the final result works as expected
`;
}

export function getRuleTemplate(name: string): string {
  return `# ${name}

## Code Style

- Follow consistent naming conventions
- Keep functions small and focused

## Best Practices

- Prefer composition over inheritance
- Write self-documenting code

## Avoid

- Do not use deprecated APIs
- Do not ignore error handling
`;
}

export function getPromptTemplate(name: string): string {
  return `# ${name}

{{description}}

## Context

Provide any relevant context here.

## Requirements

- Requirement one
- Requirement two

## Output Format

Describe the expected output format.
`;
}
