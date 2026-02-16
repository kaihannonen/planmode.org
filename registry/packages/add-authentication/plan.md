# Add Authentication

Add authentication to your {{framework}} application using {{auth_provider}}.

## Prerequisites

- An existing {{framework}} project
- A database for session/user storage (PostgreSQL recommended)
- Node.js >= 18

## Steps

### 1. Install dependencies

{{#if (eq auth_provider "nextauth")}}
```bash
npm install next-auth@beta @auth/prisma-adapter
npm install -D @types/node
```
{{/if}}
{{#if (eq auth_provider "clerk")}}
```bash
npm install @clerk/nextjs
```
{{/if}}
{{#if (eq auth_provider "lucia")}}
```bash
npm install lucia @lucia-auth/adapter-prisma oslo
```
{{/if}}
{{#if (eq auth_provider "custom")}}
```bash
npm install bcryptjs jsonwebtoken cookie
npm install -D @types/bcryptjs @types/jsonwebtoken
```
{{/if}}

### 2. Configure environment variables

Create or update `.env.local` with the required secrets:

{{#if (eq auth_provider "nextauth")}}
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```
{{/if}}
{{#if (eq auth_provider "clerk")}}
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```
{{/if}}
{{#if (eq auth_provider "lucia")}}
```
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```
{{/if}}
{{#if (eq auth_provider "custom")}}
```
JWT_SECRET=<run: openssl rand -base64 32>
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```
{{/if}}

### 3. Set up the auth configuration

{{#if (eq auth_provider "nextauth")}}
Create `src/lib/auth.ts`:

```typescript
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});
```

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```
{{/if}}

{{#if (eq auth_provider "clerk")}}
Wrap your application layout in `src/app/layout.tsx`:

```typescript
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

Create `src/middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```
{{/if}}

{{#if (eq auth_provider "lucia")}}
Create `src/lib/auth.ts`:

```typescript
import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { prisma } from "@/lib/prisma";

const adapter = new PrismaAdapter(prisma.session, prisma.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
    },
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      name: attributes.name,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      name: string;
    };
  }
}
```
{{/if}}

{{#if (eq auth_provider "custom")}}
Create `src/lib/auth.ts`:

```typescript
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string };
}
```
{{/if}}

### 4. Add route protection middleware

{{#if (eq framework "nextjs")}}
Create `src/middleware.ts` to protect routes:

```typescript
{{#if (eq auth_provider "nextauth")}}
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/dashboard/:path*", "/api/protected/:path*"],
};
{{/if}}
```
{{/if}}

{{#if (eq framework "express")}}
Create an auth middleware for Express routes:

```typescript
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./lib/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.token || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}
```
{{/if}}

### 5. Create sign-in and sign-up pages

Create `src/app/auth/signin/page.tsx` with a sign-in form that supports the configured providers. Include:

- OAuth provider buttons (GitHub, Google) for social login
- Email/password form if using credentials
- Error message display
- Redirect to dashboard on success
- Link to sign-up page

Create `src/app/auth/signup/page.tsx` with a registration form that includes:

- Email and password fields with validation
- Name field (optional)
- Password strength indicator
- Terms of service checkbox
- Redirect to sign-in on success

### 6. Create a protected dashboard page

Create `src/app/dashboard/page.tsx` that:

- Retrieves the current user session
- Displays the user's name, email, and avatar
- Shows a sign-out button
- Redirects to sign-in if not authenticated

### 7. Add sign-out functionality

Implement a sign-out button component that:

- Calls the appropriate sign-out method for {{auth_provider}}
- Clears the session/token
- Redirects to the homepage

### 8. Test the auth flow

1. Start the development server
2. Visit the sign-in page
3. Sign in with a provider or credentials
4. Verify the session is created and the dashboard loads
5. Sign out and verify the session is cleared
6. Try accessing the dashboard while signed out -- should redirect to sign-in

## What you get

- Complete authentication flow with {{auth_provider}}
- Protected routes via middleware
- Sign-in and sign-up pages
- Session management
- Sign-out functionality
- Security headers (via the security-headers rule dependency)
