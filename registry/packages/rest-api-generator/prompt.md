Generate a complete REST API for the `{{resource}}` resource using **{{framework}}**.

## Requirements

Create the following files and functionality:

### Endpoints

Implement all standard CRUD endpoints:

- `GET /api/{{resource}}` -- List all {{resource}} with pagination (query params: `page`, `limit`, `sort`, `order`)
- `GET /api/{{resource}}/:id` -- Get a single {{resource}} by ID
- `POST /api/{{resource}}` -- Create a new {{resource}} with request body validation
- `PUT /api/{{resource}}/:id` -- Update an existing {{resource}} (full replacement)
- `PATCH /api/{{resource}}/:id` -- Partially update a {{resource}}
- `DELETE /api/{{resource}}/:id` -- Delete a {{resource}} by ID

### Validation

- Validate all incoming request bodies using a schema validation library appropriate for {{framework}}:
{{#if (eq framework "express")}}
  - Use `zod` for schema validation with a validation middleware
{{/if}}
{{#if (eq framework "fastify")}}
  - Use Fastify's built-in JSON Schema validation
{{/if}}
{{#if (eq framework "hono")}}
  - Use `zod` with `@hono/zod-validator`
{{/if}}
{{#if (eq framework "fastapi")}}
  - Use Pydantic models for request/response validation
{{/if}}
- Return `400 Bad Request` with descriptive field-level error messages on validation failure

### Error handling

- Return consistent error response format: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`
- Handle 400 (Bad Request), 404 (Not Found), 409 (Conflict), and 500 (Internal Server Error)
- Include a global error handler middleware that catches unhandled errors

### Response format

- Wrap list responses in: `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 100 } }`
- Wrap single resource responses in: `{ "data": { ... } }`
- Return `201 Created` with the created resource on POST
- Return `204 No Content` on successful DELETE

### Code organization

- Separate route definitions, controller logic, validation schemas, and data access into different files
- Use TypeScript{{#if (eq framework "fastapi")}} type hints{{/if}} throughout
- Include JSDoc{{#if (eq framework "fastapi")}} / docstring{{/if}} comments on all exported functions
- Export the router/app for testing

### Testing

- Include example test cases for each endpoint using the framework's recommended testing approach
- Cover happy paths and error cases (invalid input, not found, duplicate)

Generate all the code with proper imports, types, and ready to run after installing dependencies. List the required `npm install`{{#if (eq framework "fastapi")}} / `pip install`{{/if}} command at the top.
