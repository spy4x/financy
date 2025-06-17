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

```typescript
import { db } from "@api/services/db.ts"
import { Component } from "@web/components/ui/component.tsx"
import { helper } from "@shared/helpers/helper.ts"
```

### Critical Rules

- Money: Always store as integers (cents), display with `Intl.NumberFormat`
- Auth: Validate user permissions for all data access
- State: Use `@preact/signals` instead of hooks
- Database: All queries scoped per user (multi-tenancy)
- Transactions: Use database transactions for consistency

## Domain-Specific Features

### Financial Management

- Multi-Currency: Store original amounts, convert for display
- Group Collaboration: Roles (Viewer, Editor, Admin, Owner)
- Accounts: Can belong to multiple groups
- Real-time: WebSocket notifications for shared accounts

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
