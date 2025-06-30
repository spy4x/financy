# Contributing to Financy

Thank you for your interest in contributing to Financy! This guide will help you get started with development and ensure your contributions align with the project's standards.

## Getting Started

### Prerequisites

- [Deno](https://deno.land/): `curl -fsSL https://deno.land/install.sh | sh`
- [Docker](https://www.docker.com/): `curl -fsSL https://get.docker.com | sudo sh`
- Git

### Initial Setup

1. **Fork and clone the repository**:
   ```sh
   git clone https://github.com/yourusername/financy.git
   cd financy
   ```

2. **⚠️ Install git hooks (CRITICAL)** - This step is essential for maintaining code quality:
   ```sh
   deno task hooks:install
   ```

   This sets up pre-commit hooks that automatically run:
   - TypeScript type checking
   - Linting
   - Code formatting
   - Tests

   **Note**: All commits must pass these checks. The hooks prevent committing code that doesn't meet our quality standards.

3. **Start the development environment**:
   ```sh
   deno task compose up -d
   ```

### Development Workflow

#### Code Quality Checks

Before submitting any changes, ensure your code passes all quality checks:

```sh
# Run all checks (lint, format, TypeScript, tests)
deno task check

# Run individual checks
deno task lint:check      # Check linting rules
deno task fmt:check       # Check code formatting
deno task ts:check        # Check TypeScript compilation
deno task test            # Run tests
```

#### Automatic Fixes

To automatically fix common issues:

```sh
# Apply all automatic fixes
deno task fix

# Apply individual fixes
deno task lint:fix        # Fix linting issues
deno task fmt:fix         # Fix code formatting
```

#### E2E Testing (for UI changes)

When making UI changes or implementing new features, follow this testing workflow:

```sh
# 1. Implement your feature with proper data-e2e attributes
# 2. Manual test with Playwright MCP (if available)
# 3. Write E2E tests in e2e/{feature}/ directory
# 4. Run E2E tests to validate
deno task e2e
```

**Important**: All UI elements should have `data-e2e` attributes for reliable testing:

```tsx
// ✅ Good
<button data-e2e="transaction-create-button">Create</button>
<input data-e2e="transaction-amount-input" />

// ❌ Avoid relying on text or CSS selectors in tests
```

See [E2E Testing Guidelines](docs/e2e-testing-guidelines.md) for detailed instructions.

### Development Guidelines

#### Code Style

- **Files**: Use kebab-case (`my-component.tsx`)
- **Components**: Use PascalCase (`MyComponent`)
- **Functions/Variables**: Use camelCase
- **Constants**: Use UPPER_CASE
- **No Barrel Files**: Import directly from source files, don't create index.ts re-exports
- **File Organization**: Use `+` prefix for main files to sort them first (e.g., `+Nav.tsx`)

#### Import Patterns

Use the configured path aliases:

```typescript
import { db } from "@api/services/db.ts"
import { Component } from "@web/components/ui/component.tsx"
import { helper } from "@shared/helpers/helper.ts"
```

#### CQRS System

The CQRS system is organized into separate files:

```typescript
// Import types directly from types.ts
import { Command, CommandHandler, Event } from "@shared/cqrs/types.ts"
// Import classes from their respective files
import { CommandBus } from "@shared/cqrs/command-bus.ts"
import { EventBus } from "@shared/cqrs/event-bus.ts"
```

#### Critical Rules

- **Money**: Always store as integers (cents), display with `Intl.NumberFormat`
- **Auth**: Validate user permissions for all data access
- **State**: Use `@preact/signals` instead of hooks
- **Database**: All queries scoped per user (multi-tenancy)
- **Transactions**: Use database transactions for consistency
- **Enums**: Never use 0 as an enum value to avoid falsy condition issues (`if (!enumValue)` bugs)

### Testing

- Write tests for new functionality
- Ensure all tests pass before submitting PR
- Use Deno's built-in testing framework
- Test multi-currency and role-based access scenarios

### Database Changes

If your changes require database modifications:

1. Create a new migration file in `libs/server/db/migrations/`
2. Update `libs/server/db/schema.sql` to reflect the current state
3. **Important**: Order tables by dependency - no foreign keys first, then first-level FKs, then all the rest

### Submitting Changes

1. **Ensure git hooks are installed** (`deno task hooks:install`)
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes following the guidelines above
4. Commit your changes (hooks will automatically run checks)
5. Push to your fork: `git push origin feature/your-feature-name`
6. Create a Pull Request

### Pull Request Guidelines

- **Title**: Use a clear, descriptive title
- **Description**: Explain what changes you made and why
- **Testing**: Describe how you tested your changes
- **Breaking Changes**: Clearly mark any breaking changes

### Common Issues

#### Git Hooks Not Working

If you're having issues with git hooks:

```sh
# Reinstall hooks
deno task hooks:install

# Verify hooks are installed
ls -la .git/hooks/
```

#### TypeScript Errors

If you encounter TypeScript errors:

```sh
# Check specific files
deno check path/to/file.ts

# Check all files
deno task ts:check
```

### Need Help?

- Check existing issues and discussions
- Review the [documentation](docs/)
- Ask questions in issues or discussions

## Code of Conduct

Please be respectful and constructive in all interactions. We're building an inclusive community focused on creating great financial management software.

---

Thank you for contributing to Financy! 🚀
