# Next.js + Tailwind Starter

A full-stack Next.js project with Tailwind CSS, Prisma ORM, and authentication pre-configured.

## Steps

### 1. Create the Next.js project

```bash
npx create-next-app@latest {{project_name}} --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
cd {{project_name}}
```

### 2. Install additional dependencies

```bash
npm install @prisma/client next-auth@beta
npm install -D prisma @types/node
```

### 3. Configure Tailwind CSS

Update `tailwind.config.ts` to include all content paths and add a custom color palette:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

### 4. Initialize Prisma

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and `.env` with a `DATABASE_URL` placeholder.

### 5. Define the database schema

Update `prisma/schema.prisma` with a User model and related tables for authentication:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 6. Set up the Prisma client singleton

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 7. Configure authentication

{{#if (eq auth_provider "nextauth")}}
Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const handler = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
});

export { handler as GET, handler as POST };
```
{{/if}}
{{#if (eq auth_provider "clerk")}}
Install Clerk and configure it:

```bash
npm install @clerk/nextjs
```

Wrap your app in `src/app/layout.tsx` with `<ClerkProvider>` and add the Clerk middleware in `src/middleware.ts`.
{{/if}}
{{#if (eq auth_provider "lucia")}}
Install Lucia and configure it:

```bash
npm install lucia @lucia-auth/adapter-prisma
```

Create a Lucia instance in `src/lib/auth.ts` using the Prisma adapter.
{{/if}}

### 8. Add environment variables

Add to `.env.local`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/{{project_name}}"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### 9. Run database migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 10. Create the app layout

Update `src/app/layout.tsx` with the base layout including the auth session provider and global styles.

### 11. Create the homepage

Update `src/app/page.tsx` with a landing page that shows the user's auth status and provides sign-in/sign-out buttons.

### 12. Start the development server

```bash
npm run dev
```

Visit `http://localhost:3000` to see your app running.

## What you get

- Next.js 14+ with App Router and TypeScript
- Tailwind CSS fully configured with custom theme
- Prisma ORM connected to PostgreSQL
- Authentication with {{auth_provider}}
- Database schema with User, Account, and Session models
- Development-ready with hot reload
