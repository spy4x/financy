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

- **Never Trust Frontend**: Backend must always validate and auto-determine critical business logic (transaction direction, amounts, permissions, etc.). Frontend data is considered untrusted input.
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
- Backend Validation: Critical business logic auto-determined server-side; never trust frontend input

## Testing & Performance

- Use Deno's built-in testing framework for unit tests and Playwright for end-to-end tests
- **Test Logic, Not DTOs**: Test handlers, calculations, and business logic. Don't test DTO/POJO objects (queries, commands, events) as they contain no logic
- **Focus on Handlers**: Command handlers, query handlers, event handlers contain the actual business logic and should be thoroughly tested
- Test multi-currency and role-based access scenarios
- Cache frequently accessed data (Valkey)
- Optimize for mobile-first PWA
- Implement proper database indexes

## Common Gotchas

- Timezone Handling: Store UTC, display local
- Currency Conversion: Don't lose original amounts
- Permissions: Always check user access to groups/accounts

## Database Schema

The complete database schema is documented in `libs/server/db/schema.sql`. This file contains:

- All table definitions with comments
- Indexes for performance optimization
- Foreign key relationships
- Check constraints and data validation rules

## Critical Safety Guidelines

**⚠️ NEVER perform these operations:**

- Database migrations
- Git operations (commits, pushes, branch changes, merges, etc.)
- Direct DB Schema changes - they must always be done through migration files
- Production environment changes
- SUDO operations

### Migration Protocol for Development & Testing

When database schema changes are made and need to be tested:

1. **Create Migration Files**: Always create proper migration files in `libs/server/db/migrations/`
2. **Update Schema Documentation**: Update `libs/server/db/schema.sql` to reflect changes
3. **Request Migration Execution**: When testing requires the migration to be applied, explicitly ask the developer to run the migration with specific instructions
4. **Wait for Confirmation**: Do not proceed with testing until the developer confirms the migration has been executed successfully
5. **Continue Testing**: Only after migration confirmation, proceed with testing the changes

**Example Migration Request Format:**

````
I need to test the database changes, but the migration needs to be run first. 

Please execute the migration:
```bash
deno run compose restart api
````

Once you've run the migration and confirmed it completed successfully, please let me know so I can continue testing.

````
## Development Workflow

### Code Quality Checks

Always run code quality checks before making changes and after completing work.
Use a single command to run fixes (link,fmt) & all checks(link,fmt,typescript,tests):

```bash
deno task fix-n-check
````

## Testing with Playwright MCP

### End-to-End Testing

For testing the application's behavior and functionality, use the #playwright MCP tool to interact with the running application:

**Application URL**: `http://mk.localhost`

**Test Credentials**:

- Email: `test@test.com`
- Password: `pass1234`

**Testing Workflow**:

1. Use #playwright MCP to navigate to the application URL. Never use Simple Browser.

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
await page.fill('[data-e2e="email-input"]', "test@test.com")
await page.fill('[data-e2e="password-input"]', "pass1234")
await page.click('[data-e2e="sign-in-button"]')

// Test specific functionality as needed
```

Use Playwright MCP whenever you need to:

- Verify UI/UX changes work correctly
- Test new features end-to-end
- Validate mobile responsiveness
- Check PWA functionality
- Test real-time features and WebSocket connections

## Refactoring Principles

When performing major refactoring work, follow these principles:

1. **No barrel files** - Use single entry point files with `+` prefix that import everything they need
2. **CQRS for all business logic** - Data fetching and mutations must go through CQRS layer
3. **Break fast, refactor completely** - No backward compatibility during refactoring
4. **Clean separation** - Services handle specific concerns, handlers only route/parse
5. **Complete replacement** - Mark old files as `*.old.ts`, delete after testing
6. **Single entry points** - Use `+` prefix files to prevent circular dependencies
7. **Comprehensive testing** - Create unit tests using `@shared/testing` following existing patterns
8. **Clean implementations** - Build new code rather than refactoring existing code

### Refactoring Workflow:

- Mark old files as `*.old.ts` immediately
- Build clean, new implementations from scratch
- Use CQRS for all data operations
- Accept that functionality will be broken during refactoring
- Create comprehensive unit tests before cleanup
- Delete `*.old.ts` files only after testing passes

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
7. Run `deno task fix-n-check` to ensure all quality checks pass
8. Ensure all new UI elements have `data-e2e` attributes
9. Complete manual testing with Playwright MCP
10. Write E2E tests for new functionality
11. Verify all tests pass with `deno task e2e`
12. Ensure test performance is very fast or fail fast (ideally under 2 seconds)
13. Handle test data cleanup (use unique identifiers)
14. Verify code follows established patterns and conventions
