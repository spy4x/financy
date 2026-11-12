/** @jsxImportSource preact */
/// <reference lib="deno.ns" />
/// <reference lib="dom" />

import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { renderToString } from "preact-render-to-string"
import { activityAuditEvent } from "@domain/identity"
import { type ActivityRow, GroupActivityPanel } from "./group-activity-panel.tsx"
import { auditEventLabel } from "./admin-audit-screen.tsx"
import { ADMIN_ENGLISH } from "./i18n-testing.ts"

/** Financy's own activity kinds, with the real catalogs and the real `PRODUCT_ACTIVITY_KINDS`. */

function sentence(kind: string, details: ActivityRow["details"] = {}): string {
  const event: ActivityRow = {
    id: `1`,
    kind,
    at: new Date().toISOString(),
    actor: { userId: 1, name: `Ada` },
    target: null,
    entity: null,
    details,
  }
  const page = renderToString(
    <GroupActivityPanel events={[event]} loading={false} error={null} />,
  )
  // Names and what members typed sit in `<bdi>`: the sentence is the text around them.
  const text = page.replaceAll(/<\/?bdi[^>]*>/g, ``)
  const match = text.match(/Ada [^<]*/)
  return match?.[0] ?? text
}

describe("Financy's activity in the group activity panel", () => {
  it("names the account an account event is about, and the old name of a renamed one", () => {
    expect(sentence(`account.archived`, { name: `Cash` })).toBe(`Ada archived the account “Cash”`)
    expect(sentence(`account.updated`, { name: `Cash`, from: `Wallet` })).toBe(
      `Ada renamed the account “Wallet” to “Cash”`,
    )
    expect(sentence(`account.deleted`)).toBe(`Ada changed an account`)
  })

  it("counts the subcategories an archived category took along", () => {
    expect(sentence(`category.archived`, { name: `Food`, children: 2 })).toBe(
      `Ada archived the category “Food” with 2 subcategories`,
    )
  })
})

describe("Financy's activity in the admin audit log", () => {
  it("titles an account event with its own label", () => {
    expect(auditEventLabel(ADMIN_ENGLISH, activityAuditEvent(`account.default_set`))).toBe(
      `Default finance account set`,
    )
  })
})
