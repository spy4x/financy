<div align="center">

# Financy

**A finance tracker for a person or a family, in any mix of currencies.**

[![CI](https://ci.antonshubin.com/api/badges/1/status.svg)](https://ci.antonshubin.com/repos/1)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

</div>

**Status: being rebuilt, not ready for use.** Financy is starting again on
[Seed](https://github.com/spy4x/seed), the free SaaS starter, so it gets sign-in with two-factor
authentication, households with roles, live updates on every device, an app that works offline,
an admin panel and a public website from day one. Right now this repository is Seed with
Financy's name; Financy's own features land one pull request at a time.
[Follow the plan](https://github.com/spy4x/financy/issues).

## What Financy will do

- **Every currency, one total.** Accounts in any currency; every transaction keeps its original
  amount next to the converted one, so a later exchange rate never rewrites your history.
- **Made for households.** Share a budget with your partner or family, each with their own role,
  and see every change live.
- **Yours to host, or ours.** Free and open source to run on your own server, with a paid cloud
  for people who would rather not.

## The first Financy

The first version lives on the [`legacy`](https://github.com/spy4x/financy/tree/legacy) branch.
It is frozen: it shows what Financy did, and nothing more is built on it.

## Quick start

Financy runs and develops exactly like Seed: [docs/development.md](docs/development.md) has the
commands. How it keeps taking Seed's changes: [AGENTS.md](AGENTS.md).

## Licence

Financy is licensed under the [GNU AGPL-3.0](LICENSE). It is built on Seed, whose code keeps its
MIT notice in [LICENSES/MIT-seed.txt](LICENSES/MIT-seed.txt).
