// Seed's own site: see docs/start-a-product.md
import { IconWallet } from "@spy4x/preact-icons"

/** The product this website promotes, as every page names it. */
export const SITE_NAME = `Financy`

/** The product's icon, drawn beside `SITE_NAME` in every brand mark of the website. */
export const SITE_ICON = IconWallet

/**
 * Where the source lives: the "View on GitHub" links and the footer point here.
 */
export const REPOSITORY_URL = `https://github.com/spy4x/financy`

/** Where a person writes to the people behind the product, such as for a refund. */
export const CONTACT_EMAIL = `hi@financy.dev`

/** The author's own site: the person behind the product in JSON-LD and the "who builds it" links. */
export const AUTHOR_URL = `https://antonshubin.com`

/** An address of the app as the pictures' browser frames show it, the same in every language. */
export function appAddress(path: string): string {
  return `app.financy.dev${path}`
}
