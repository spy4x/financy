/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { type ActivityEvent, describeActivity, PRODUCT_ACTIVITY_KINDS } from "./+lib.ts"

const ada = { userId: 1, name: "Ada" }

function say(kind: string, details: ActivityEvent["details"] = {}) {
  return describeActivity({ kind, actor: ada, target: null, details })
}

Deno.test("product activity: an account's changes read as sentences that name the account", () => {
  expect(say("account.created", { name: "Wallet" })).toBe("Ada added the account “Wallet”")
  expect(say("account.created")).toBe("Ada added an account")
  expect(say("account.updated", { name: "Cash", from: "Wallet" })).toBe(
    "Ada renamed the account “Wallet” to “Cash”",
  )
  expect(say("account.updated", { name: "Cash" })).toBe("Ada changed the account “Cash”")
  expect(say("account.updated")).toBe("Ada changed an account")
  expect(say("account.archived", { name: "Cash" })).toBe("Ada archived the account “Cash”")
  expect(say("account.unarchived", { name: "Cash" })).toBe("Ada unarchived the account “Cash”")
  expect(say("account.default_set", { name: "Cash" })).toBe(
    "Ada made the account “Cash” the default",
  )
  expect(say("account.default_cleared")).toBe("Ada stopped using an account as the default")
  expect(say("account.deleted", { name: "Cash" })).toBe("Ada deleted the account “Cash”")
  expect(say("account.restored", { name: "Cash" })).toBe("Ada restored the account “Cash”")
})

Deno.test("product activity: a category's changes name it, and the subcategories that followed it", () => {
  expect(say("category.created", { name: "Food" })).toBe("Ada added the category “Food”")
  expect(say("category.updated", { name: "Meals", from: "Food" })).toBe(
    "Ada renamed the category “Food” to “Meals”",
  )
  expect(say("category.updated")).toBe("Ada changed a category")
  expect(say("category.archived", { name: "Food", children: 2 })).toBe(
    "Ada archived the category “Food” with 2 subcategories",
  )
  expect(say("category.unarchived", { name: "Food", children: 1 })).toBe(
    "Ada unarchived the category “Food” with 1 subcategory",
  )
  expect(say("category.archived")).toBe("Ada archived a category")
})

Deno.test("product activity: every kind has its own sentence, never the generic one", () => {
  for (const { kind } of PRODUCT_ACTIVITY_KINDS) {
    expect(say(kind)).not.toBe("Ada changed something in the group")
  }
})
