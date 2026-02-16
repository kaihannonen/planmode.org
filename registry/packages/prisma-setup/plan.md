# Prisma Setup with PostgreSQL

Set up Prisma ORM with PostgreSQL, including migrations, seed data, and a type-safe client.

## Prerequisites

- Node.js >= 18
- A running PostgreSQL instance (local or remote)
- An existing TypeScript project with `tsconfig.json`

## Steps

### 1. Install Prisma

```bash
npm install @prisma/client
npm install -D prisma tsx
```

### 2. Initialize Prisma

```bash
npx prisma init --datasource-provider postgresql
```

This creates:
- `prisma/schema.prisma` -- the schema file
- `.env` -- with a `DATABASE_URL` placeholder

### 3. Configure the database connection

Update `.env` with your database URL:

```
DATABASE_URL="{{database_url}}"
```

### 4. Define your schema

Edit `prisma/schema.prisma` to define your data models. Here is a starter schema:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
}
```

### 5. Create and run the first migration

```bash
npx prisma migrate dev --name init
```

This will:
- Create the migration SQL file in `prisma/migrations/`
- Apply the migration to your database
- Generate the Prisma Client

### 6. Set up the Prisma client singleton

Create `src/lib/prisma.ts` (or `src/lib/db.ts`):

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

This pattern prevents creating multiple Prisma Client instances during hot-reload in development.

### 7. Create a seed script

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin User",
      posts: {
        create: [
          {
            title: "Welcome to the app",
            content: "This is a seed post.",
            published: true,
          },
        ],
      },
    },
  });

  console.log("Seeded user:", user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add the seed command to `package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

Run the seed:

```bash
npx prisma db seed
```

### 8. Add Prisma scripts to package.json

```json
{
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:generate": "prisma generate",
    "db:reset": "prisma migrate reset"
  }
}
```

### 9. Add Prisma files to .gitignore

Ensure `.env` is in `.gitignore`. The `prisma/migrations/` directory should be committed to version control.

### 10. Verify the setup

```bash
npx prisma studio
```

Open the Prisma Studio browser UI at `http://localhost:5555` to inspect your database.

## What you get

- Prisma ORM connected to PostgreSQL
- Type-safe database client with auto-generated types
- Migration system for schema changes
- Seed script for development data
- Prisma Studio for visual database browsing
- Singleton client pattern for Next.js / hot-reload compatibility
