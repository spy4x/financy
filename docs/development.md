# Development

Moved out of the README so its first screen stays short. See
[README.md](../README.md) for what Financy is and its current status.

## Running the stack

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
`infra/envs/.env`. See [5.deployment.md](5.deployment.md) for
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
[4.tech-stack.md](4.tech-stack.md).

## Screenshots

`screenshots/dashboard.png`, the README's picture, shows the web app signed in
as the seed user of `infra/scripts/seed-data.ts` (renamed to "Jane Doe"), in
the dark theme at 1280×800, with the production navigation (`VITE_ENV=prod`).
The data is the seed script's invented demo data, never real finances.
