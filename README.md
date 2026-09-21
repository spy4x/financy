# Financy

Self-hosted, double-entry finance tracker for a person or a family.

**Status: work in progress.** Development is paused until 2027. Treat
Financy as not ready for everyday use unless the code itself proves
otherwise — see [docs/roadmap.md](docs/roadmap.md) for what is built versus
still planned.

Financy's design targets double-entry accounting, multi-currency accounts,
and group or family collaboration with role-based access (see
[docs/1.principles.md](docs/1.principles.md),
[docs/2.features.md](docs/2.features.md) and
[docs/3.architecture.md](docs/3.architecture.md)). If you need something
finished today, use Actual Budget or Firefly III instead.

## Quick start

Requires [Deno](https://deno.land/) and [Docker](https://www.docker.com/) or
Podman.

1. Clone the repository.
2. Copy `infra/envs/.env.example` to `infra/envs/.env` and fill in the
   values.
3. Run `deno task compose up -d`.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
