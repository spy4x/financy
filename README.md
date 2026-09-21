# Financy

Self-hosted finance tracker for a person or a family.

**Status: work in progress, not ready for everyday use.** Development is
paused until 2027. Password reset and two-factor authentication are still
in progress — see [docs/roadmap.md](docs/roadmap.md) for what is built
versus still planned.

Financy targets multi-currency accounts and group or family collaboration
with role-based access (see [docs/1.principles.md](docs/1.principles.md),
[docs/2.features.md](docs/2.features.md) and
[docs/3.architecture.md](docs/3.architecture.md)). Transfers between
accounts are recorded as two linked transactions, following double-entry
principles for that feature (see
[docs/features/transfer-accounting-overview.md](docs/features/transfer-accounting-overview.md)).
If you need something finished today, use Actual Budget or Firefly III
instead.

## Quick start

Requires [Deno](https://deno.land/) and [Docker](https://www.docker.com/) or
Podman.

1. Clone the repository.
2. Copy `infra/envs/.env.example` to `infra/envs/.env` and fill in the
   values. To use Docker rather than Podman, set `CONTAINER_PROVIDER=docker`
   in that file — `infra/scripts/compose.ts` reads it and otherwise runs
   Podman.
3. Create the reverse-proxy network once: `docker network create proxy`
   (or `podman network create proxy`). The `api`, `web`, `minio` and
   `grafana` services attach to this network as external, and Compose
   refuses to start without it.
4. Run `deno task compose up -d`.

That task runs `infra/scripts/compose.ts`, which builds the base image and
starts the stack defined in `infra/compose/compose.shared.yml` plus
`compose.dev.yml` or `compose.prod.yml`, picked by `ENV` in
`infra/envs/.env`. See [docs/5.deployment.md](docs/5.deployment.md) for
details.

## Tech stack

Deno, Hono, Preact, Vite and PostgreSQL, with Valkey for caching and Docker
Compose for local development and deployment. Details in
[docs/4.tech-stack.md](docs/4.tech-stack.md).

## Documentation

- [Principles](docs/1.principles.md)
- [Features](docs/2.features.md)
- [Architecture](docs/3.architecture.md)
- [Tech stack](docs/4.tech-stack.md)
- [Deployment](docs/5.deployment.md)
- [Infrastructure](docs/6.infrastructure.md)
- [Roadmap](docs/roadmap.md)
- [Recommendations and gaps](docs/7.recommendations-expanded.md)
- [Telegram bot](docs/telegram-bot.md)
- [Offline-first data with Dexie.js](docs/offline-first-with-dexie.md)
- [Woodpecker CI setup](docs/woodpecker-ci-setup.md)
- [Feature notes](docs/features/) - implementation notes for individual UI
  features

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
