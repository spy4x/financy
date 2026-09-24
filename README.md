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

## Encrypted env files

The real `infra/envs/.env` and `infra/envs/.env.prod` are committed only in
encrypted form, as `infra/envs/.env.age` and `infra/envs/.env.prod.age`.
Every value is encrypted on its own line (`KEY=age64:…`) with
[`@spy4x/server/env-age64`](https://jsr.io/@spy4x/server/doc/env-age64);
comments stay in plain text, so never put a secret in a comment.

- `deno task env:decrypt` writes every `.env*.age` back to its plaintext
  sibling.
- `deno task env:encrypt` encrypts every `.env*` file into its `.age`
  sibling. An unchanged value keeps its ciphertext, so only edited lines
  show up in the diff.
- `deno task env:status` shows whether the key is found and which files the
  other two tasks see.

Run them from the repository root. The key is `.age/key.txt` in the main
checkout. It is gitignored and never committed, so keep a backup of it
wherever you keep your other secrets; without it the `.age` files cannot be
decrypted. A linked git worktree has no key of its own and uses the main
checkout's key automatically.

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

Copyright (C) 2026 Anton Shubin

Licensed under [AGPL-3.0](LICENSE). Contribution terms are in
[CONTRIBUTING.md](CONTRIBUTING.md).
