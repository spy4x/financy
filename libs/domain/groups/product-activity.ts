/**
 * Financy's own kinds of group activity: its finance accounts and its categories. Financy replaced Seed's empty slot and lists this file in `.seed/skip`, so taking
 * Seed's later changes never conflicts here
 * ([Connect a feature to the app](../../../docs/aggregate-extras.md)).
 *
 * @module
 */

import type { AuditDetails, ProductActivityKind, ProductActivityMessage } from "./activity.ts"

/** The finance things an audit event can point at besides Seed's. */
export type ProductEntityType = "account" | "category"

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function quoted(value: unknown): string {
  return typeof value === "string" && value !== "" ? `“${value}”` : ""
}

/** The panel's sentence of an account or category event that names it, or `unnamed` without one. */
function named(key: string, unnamed: string, details: AuditDetails): ProductActivityMessage {
  const name = text(details.name)
  return name ? { key, values: { name } } : { key: unnamed, values: {} }
}

/** An account event that only names the account: its kind, admin label, sentence and verb. */
function accountKind(
  kind: string,
  label: string,
  key: string,
  verb: (account: string) => string,
): ProductActivityKind {
  return {
    kind,
    label,
    message: (details) => named(key, `GroupActivity.accountChangedUnnamed`, details),
    describe: (who, details) => {
      const name = quoted(details.name)
      return `${who} ${verb(name ? `the account ${name}` : `an account`)}`
    },
  }
}

/**
 * A category event that may carry the subcategories it took along: its kind, admin label, the
 * sentences alone and with `{count}` subcategories, and its verb.
 */
function categoryKind(
  kind: string,
  label: string,
  alone: string,
  withChildren: string,
  verb: (category: string) => string,
): ProductActivityKind {
  const children = (details: AuditDetails) =>
    typeof details.children === "number" && details.children > 0 ? details.children : null
  return {
    kind,
    label,
    message: (details) => {
      const said = named(alone, `GroupActivity.categoryChangedUnnamed`, details)
      const count = children(details)
      return count && said.key === alone
        ? { key: withChildren, values: { ...said.values, count } }
        : said
    },
    describe: (who, details) => {
      const name = quoted(details.name)
      const said = `${who} ${verb(name ? `the category ${name}` : `a category`)}`
      const count = children(details)
      if (!count) return said
      return `${said} with ${count} ${count === 1 ? `subcategory` : `subcategories`}`
    },
  }
}

/** An `.updated` event: a rename when it kept the old name, else a change of the named thing. */
function updatedKind(thing: `account` | `category`, label: string): ProductActivityKind {
  const keys = thing === `account`
    ? {
      renamed: `GroupActivity.accountRenamed`,
      changed: `GroupActivity.accountChanged`,
      unnamed: `GroupActivity.accountChangedUnnamed`,
    }
    : {
      renamed: `GroupActivity.categoryRenamed`,
      changed: `GroupActivity.categoryChanged`,
      unnamed: `GroupActivity.categoryChangedUnnamed`,
    }
  return {
    kind: `${thing}.updated`,
    label,
    message: (details) => {
      const from = text(details.from)
      const name = text(details.name)
      if (from && name) return { key: keys.renamed, values: { from, name } }
      return named(keys.changed, keys.unnamed, details)
    },
    describe: (who, details) => {
      const from = quoted(details.from)
      const name = quoted(details.name)
      if (from && name) return `${who} renamed the ${thing} ${from} to ${name}`
      const some = thing === `account` ? `an account` : `a category`
      return name ? `${who} changed the ${thing} ${name}` : `${who} changed ${some}`
    },
  }
}

/** The kinds the group activity panel, `describeActivity` and the admin audit log know besides Seed's. */
export const PRODUCT_ACTIVITY_KINDS: readonly ProductActivityKind[] = [
  accountKind(
    `account.created`,
    `AdminAuditEvent.financeAccountCreated`,
    `GroupActivity.accountCreated`,
    (account) => `added ${account}`,
  ),
  updatedKind(`account`, `AdminAuditEvent.financeAccountUpdated`),
  accountKind(
    `account.archived`,
    `AdminAuditEvent.financeAccountArchived`,
    `GroupActivity.accountArchived`,
    (account) => `archived ${account}`,
  ),
  accountKind(
    `account.unarchived`,
    `AdminAuditEvent.financeAccountUnarchived`,
    `GroupActivity.accountUnarchived`,
    (account) => `unarchived ${account}`,
  ),
  accountKind(
    `account.default_set`,
    `AdminAuditEvent.financeAccountDefaultSet`,
    `GroupActivity.accountDefaultSet`,
    (account) => `made ${account} the default`,
  ),
  accountKind(
    `account.default_cleared`,
    `AdminAuditEvent.financeAccountDefaultCleared`,
    `GroupActivity.accountDefaultCleared`,
    (account) => `stopped using ${account} as the default`,
  ),
  accountKind(
    `account.deleted`,
    `AdminAuditEvent.financeAccountDeleted`,
    `GroupActivity.accountDeleted`,
    (account) => `deleted ${account}`,
  ),
  accountKind(
    `account.restored`,
    `AdminAuditEvent.financeAccountRestored`,
    `GroupActivity.accountRestored`,
    (account) => `restored ${account}`,
  ),
  categoryKind(
    `category.created`,
    `AdminAuditEvent.categoryCreated`,
    `GroupActivity.categoryCreated`,
    `GroupActivity.categoryCreated`,
    (category) => `added ${category}`,
  ),
  updatedKind(`category`, `AdminAuditEvent.categoryUpdated`),
  categoryKind(
    `category.archived`,
    `AdminAuditEvent.categoryArchived`,
    `GroupActivity.categoryArchived`,
    `GroupActivity.categoryArchivedWithChildren`,
    (category) => `archived ${category}`,
  ),
  categoryKind(
    `category.unarchived`,
    `AdminAuditEvent.categoryUnarchived`,
    `GroupActivity.categoryUnarchived`,
    `GroupActivity.categoryUnarchivedWithChildren`,
    (category) => `unarchived ${category}`,
  ),
]
