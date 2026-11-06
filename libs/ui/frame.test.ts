import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import { IconBank, IconWallet } from "@spy4x/preact-icons"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import app from "@i18n/app/en.ts"
import { navItems } from "./frame.tsx"

const ENGLISH = createTranslator({ language: `en`, catalogs: [{ source: app }] })

it("marks Accounts with the bank icon and leaves the wallet to the brand", () => {
  const items = navItems(`group-1`, ENGLISH)
  expect(items.find((item) => item.key === `accounts`)?.Icon).toBe(IconBank)
  expect(items.some((item) => item.Icon === IconWallet)).toBe(false)
})
