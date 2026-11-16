/**
 * The guides Financy's website publishes at `/docs/<slug>`, and the address their pointer lines
 * name: Financy's own guides for a person who runs it, none of Seed's. Financy owns this file
 * (`.seed/skip`, `docs/start-a-product.md`, "The product's own guides"); `docs-site.ts` renders
 * them.
 *
 * @module
 */
import type { PublishedDocGroup } from "./docs-site.ts"
import backups from "../../docs/financy/backups.md" with { type: "text" }
import exchangeRates from "../../docs/financy/exchange-rates.md" with { type: "text" }
import selfHost from "../../docs/financy/self-host.md" with { type: "text" }
import upgrade from "../../docs/financy/upgrade.md" with { type: "text" }

/** The address of the website the guides' own pointer lines name (`docs/financy/*.md`). */
export const DOCS_SITE_ORIGIN = `https://financy.dev`

/**
 * The guides the website publishes, in reading order. Every other file under `docs/` stays in the
 * repository only. A file listed here needs its import above, its line in `.dockerignore` and
 * `infra/deploy/include.txt`, and the pointer line at its top (`docs-site.test.ts` and
 * `tests/dockerignore.test.ts` check all four).
 */
export const PUBLISHED_DOCS: readonly PublishedDocGroup[] = [
  {
    title: `Self-hosting`,
    docs: [
      {
        file: `docs/financy/self-host.md`,
        slug: `self-host`,
        text: selfHost,
        summary: `Run Financy for your household on your own server.`,
      },
      {
        file: `docs/financy/upgrade.md`,
        slug: `upgrade`,
        text: upgrade,
        summary: `Move to a newer release and keep your records.`,
      },
      {
        file: `docs/financy/backups.md`,
        slug: `backups`,
        text: backups,
        summary: `Turn on the daily backup, check it ran, and rehearse a restore.`,
      },
    ],
  },
  {
    title: `Reference`,
    docs: [
      {
        file: `docs/financy/exchange-rates.md`,
        slug: `exchange-rates`,
        text: exchangeRates,
        summary: `Where rates and coin prices come from, and how a rate is chosen.`,
      },
    ],
  },
]
