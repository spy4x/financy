# Copilot Instructions for Financy

## Project Overview

Financy is an open-source, self-hostable financial management application built with modern web technologies. It's designed for individuals, families, and small businesses to track expenses, manage group finances, and collaborate on financial decisions.

## Technology Stack

- Frontend: Deno, Vite, Preact+Signals, TailwindCSS, PWA (mobile-first)
- Backend: Deno, Hono.js, PostgreSQL, Valkey (Redis), WebSockets
- Libraries: TypeScript, Arktype for validation
- Infrastructure: Docker Compose, Traefik

## Code Organization

```
├── apps/
│   ├── api/          # Backend API server
│   └── web/          # Frontend PWA
├── libs/
│   ├── client/       # Client-side utilities
│   ├── server/       # Server-side utilities
│   └── shared/       # Shared utilities
├── infra/            # Infrastructure configs
└── docs/             # Project documentation
```

## Development Guidelines

### Core Principles

- Transparency: Clear permissions, audit trails, and trustworthy sync
- Scalability: Modular, extensible architecture
- Accessibility: Simple UX for all users, mobile-first
- Security: HTTPS, hashed passwords, role-based access

## Key Patterns & Conventions

### Code Style

- Files: kebab-case (`my-component.tsx`)
- Components: PascalCase (`MyComponent`)
- Functions/Variables: camelCase
- Constants: UPPER_CASE
- Imports: Use path aliases from `deno.jsonc`
- No Barrel Files: Do not create index.ts files for re-exporting. Import directly from source files.
- No Re-exports: Do not re-export types or classes from modules. Import directly from the source.
- File Organization: Use `+` prefix for main files to sort them first (e.g., `+Nav.tsx` or `+my-api.ts`)

```typescript
import { db } from "@api/services/db.ts"
import { Component } from "@web/components/ui/component.tsx"
import { helper } from "@shared/helpers/helper.ts"
```

### CQRS Imports

The CQRS system is organized into separate files:

- Types: `@shared/cqrs/types.ts` - Contains Command, Event, CommandHandler, etc.
- Classes: `@shared/cqrs/command-bus.ts`, `@shared/cqrs/event-bus.ts`

```typescript
// Import types directly from types.ts
import { Command, CommandHandler, Event } from "@shared/cqrs/types.ts"
// Import classes from their respective files
import { CommandBus } from "@shared/cqrs/command-bus.ts"
import { EventBus } from "@shared/cqrs/event-bus.ts"

// Example usage with generic types
interface MyCommandPayload {
  name: string
}
interface MyCommandResult {
  userId: number
}
class MyCommand implements Command<MyCommandPayload, MyCommandResult> {
  __resultType?: MyCommandResult
  constructor(public data: MyCommandPayload) {}
}

interface MyEventPayload {
  userId: number
}
class MyEvent implements Event<MyEventPayload> {
  constructor(public data: MyEventPayload) {}
}
```

### Critical Rules

- Money: Always store as integers (cents), display with `Intl.NumberFormat`
- Auth: Validate user permissions for all data access
- State: Use `@preact/signals` instead of hooks
- Database: All queries scoped per user (multi-tenancy)
- Transactions: Use database transactions for consistency
- Enums: Never use 0 as an enum value to avoid falsy condition issues (`if (!enumValue)` bugs)

## Domain-Specific Features

### Financial Management

- Multi-Currency: Store original amounts, convert for display
- Group Collaboration: Roles (Viewer, Editor, Admin, Owner)
- Accounts: Can belong to multiple groups
- Real-time: WebSocket notifications for shared accounts
- Transaction Types: Use DEBIT (money out) and CREDIT (money in) for broader applicability beyond simple expense/income (supports lending, debt returns, etc.)

### Security & Architecture

- Multi-tenant: All data scoped per user
- Permissions: Fine-grained access control
- Audit Trail: Log all financial changes
- Offline Support: Queue transactions for sync

## Testing & Performance

- Use Deno's built-in testing framework
- Test multi-currency and role-based access
- Cache frequently accessed data (Valkey)
- Optimize for mobile-first PWA
- Implement proper database indexes

## Common Gotchas

- Money Precision: Store as cents (INT), display as `Intl.NumberFormat` strings on frontend
- Timezone Handling: Store UTC, display local
- Currency Conversion: Don't lose original amounts
- Permissions: Always check user access to groups/accounts

## Database Schema

The complete database schema is documented in `libs/server/db/schema.sql`. This file contains:

- All table definitions with comments
- Indexes for performance optimization
- Foreign key relationships
- Check constraints and data validation rules

**Important**: The schema.sql file is generated from migrations and serves as documentation. Always create new migration files for schema changes rather than editing schema.sql directly. **When creating a new migration, always regenerate and update the schema.sql file to reflect the current database state.**

## Development Workflow

### Code Quality Checks

Always run code quality checks before making changes and after completing work:

```bash
# Run all checks (lint, format, TypeScript, tests)
deno task check

# Apply automatic fixes
deno task fix

# Individual commands if needed
deno task lint:check    # Check linting rules
deno task fmt:check     # Check code formatting  
deno task ts:check      # Check TypeScript compilation
deno task test          # Run tests
deno task lint:fix      # Fix linting issues
deno task fmt:fix       # Fix code formatting
```

**Important**: Use `deno task check` and `deno task fix` (not `deno check`, `deno lint`, or `deno fmt`) - these are composite commands that run multiple quality checks and fixes.

## Testing with Playwright MCP

### End-to-End Testing

For testing the application's behavior and functionality, use the #playwright MCP tool to interact with the running application:

**Application URL**: `http://mk.localhost`

**Test Credentials**:

- Email: `test@test.com`
- Password: `pass1234`

**Testing Workflow**:

1. Use #playwright MCP to navigate to the application URL.

- If Playwright MCP is not started (and you don't see it's tools) - ask developer to start it by pressing `F1` and selecting `MCP: List Servers` > `Start`.
- The app is usually running, so try access the app using Playwright first. If not running, use `deno task dev` (app will run in the background, so don't expect logs in the terminal).
- The web app is SPA, so give it a few seconds to connect to WS, load and display data.

2. Either create a new account or sign in with the test credentials above
3. Test the application's functionality.

**Example Playwright Commands**:

```typescript
// Navigate to the application
await page.goto("http://mk.localhost")

// Sign in with test credentials
await page.fill('[data-testid="email-input"]', "test@test.com")
await page.fill('[data-testid="password-input"]', "pass1234")
await page.click('[data-testid="sign-in-button"]')

// Test specific functionality as needed
```

Use Playwright MCP whenever you need to:

- Verify UI/UX changes work correctly
- Test new features end-to-end
- Validate mobile responsiveness
- Check PWA functionality
- Test real-time features and WebSocket connections

## When Making Changes

0. Suggest best practices - Always recommend better approaches when available, before implementing changes. If major change - stop and ask if unsure. If minor changes, proceed with caution.
1. Analyze app dependencies: Check which `./apps/*` applications require changes (often it's multiple, i.e. `api` and `web`)
2. Database changes: If database structure changes:
   - Create a new migration file in `libs/server/db/migrations/`
   - Update `libs/server/db/schema.sql` to reflect the current state
   - **Important**: Order tables by dependency - no foreign keys first, then first-level FKs, then all the rest
3. Consider impact on existing users and maintain backward compatibility
4. Test multi-user scenarios and verify mobile responsiveness
5. Validate security implications and permissions
6. Update documentation as needed
7. Run `deno task check` to ensure all quality checks pass
