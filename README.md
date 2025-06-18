# Financy

Open-source, self-hostable finance tracking for individuals, families, and small
businesses.

Financy is an **open-source** and **self-hostable** double-entry financial
management web application focused on personal, family, and business expense
management. It emphasizes rich capabilities, transparency, and ease of use while
offering advanced features like group collaboration, public API integrations,
and Telegram bot integration.

## Documentation

- [**Project Overview**](docs/1.principles.md) - Core principles and vision
- [**Features**](docs/2.features.md) - Detailed functionality and capabilities
- [**Architecture**](docs/3.architecture.md) - System components and interactions
- [**Technology Stack**](docs/4.tech-stack.md) - Tools and frameworks used
- [**Deployment**](docs/5.deployment.md) - Installation and setup instructions
- [**Infrastructure**](docs/6.infrastructure.md) - Deployment and hosting information

## Quick Start

Prerequisites (unix-like OS):

- [Deno](https://deno.land/): `curl -fsSL https://deno.land/install.sh | sh`
- [Docker](https://www.docker.com/): `curl -fsSL https://get.docker.com | sudo sh`

To start local development:

1. Clone the repository
2. **Install git hooks** (important for code quality):
   ```sh
   deno task hooks:install
   ```
3. Start all services:
   ```sh
   deno task compose up -d
   ```

## Development Commands

For development and code quality, use these commands:

- **`deno task check`** - Run comprehensive checks (TypeScript, linting, formatting, tests)
- **`deno task fix`** - Automatically fix linting and formatting issues
- **`deno task test`** - Run test suite only
- **`deno task ts:check`** - TypeScript check only

This will launch all necessary services & apps in Docker Compose.

## Contributing

Contributions are welcome! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the [MIT License](LICENSE).

---
