import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { byDeletedAt } from "./transaction-order.ts"

describe("byDeletedAt", () => {
  it("puts the latest deleted first, entries and transfers mixed, and the lower id first on a tie", () => {
    const rows = [
      { id: "entry-old", deletedAt: "2026-11-10T08:00:00.000Z" },
      { id: "transfer-new", fromAccountId: "a", deletedAt: "2026-11-12T08:00:00.000Z" },
      { id: "entry-new", deletedAt: "2026-11-11T08:00:00.000Z" },
      { id: "b-tie", deletedAt: "2026-11-09T08:00:00.000Z" },
      { id: "a-tie", fromAccountId: "a", deletedAt: "2026-11-09T08:00:00.000Z" },
    ]

    expect(rows.sort(byDeletedAt).map((row) => row.id))
      .toEqual(["transfer-new", "entry-new", "entry-old", "a-tie", "b-tie"])
  })
})
