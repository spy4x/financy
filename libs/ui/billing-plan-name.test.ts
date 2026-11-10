import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { PRO_PLAN_ID } from "@domain/billing"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import appEn from "@i18n/app/en.ts"
import { planName } from "./billing-screen.tsx"

/**
 * Financy's own catalog names its paid plan. Seed's tests run on a test catalog that calls it Pro,
 * so this file holds the name that Financy's billing tab and checkout toast show.
 */

const LANGUAGES = [`en`, `ru`, `ar`, `de`, `es`, `fr`, `pt-BR`, `zh-CN`, `ja`]

describe(`Financy's plan names`, () => {
  it(`names the paid plan Household in every language, as its catalog does`, async () => {
    for (const language of LANGUAGES) {
      const translation = (await import(`../../i18n/app/${language}.ts`)).default
      const t = createTranslator({ language, catalogs: [{ source: appEn, translation }] })
      expect(planName(t, PRO_PLAN_ID)).toBe(`Household`)
    }
  })
})
