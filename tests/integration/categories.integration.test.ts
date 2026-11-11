/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { CATEGORY_MAX_PER_GROUP, type CategoryIcon, CategoryKind } from "@domain/categories"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { readAdminCategories } from "@server/categories/admin-categories.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Categories against a real Postgres built from schema.sql: the repository's rules inside the
 * write's transaction (role, tree, sibling names, caps), what the table itself refuses, and the
 * operator's read. The transports and the gates are in `apps/api/features/categories/`; a write
 * racing a member's removal is in `group-write-race.integration.test.ts`. Needs `DB_*` (recipe in
 * docs/handoff.md); it fails when they are missing rather than skipping.
 */

const fields = {
  name: "Food",
  kind: CategoryKind.EXPENSE,
  icon: "utensils" as CategoryIcon,
  color: "#c2410c",
  parentId: null as string | null,
}

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error) => error)
}

async function nextSequence(sql: postgres.Sql, groupId: string): Promise<bigint> {
  return BigInt(
    (await sql<{ next: string }[]>`
      SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
    `)[0].next,
  )
}

/** Gives the household `count` more live categories without going through the cap. */
async function fill(sql: postgres.Sql, groupId: string, userId: number, count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuidV7(),
    group_id: groupId,
    name: `Filler ${index + 1}`,
    kind: CategoryKind.EXPENSE,
    icon: "tag",
    color: "#4b5563",
    change_sequence: 1,
    created_by_user_id: userId,
    updated_by_user_id: userId,
  }))
  await sql`INSERT INTO categories ${sql(rows)}`
}

Deno.test("categories against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const categories = new PostgresCategoryRepository(sql)
    const create = (userId: number, groupId: string, more: Partial<typeof fields> = {}) =>
      categories.create({ groupId, id: uuidV7(), ...fields, ...more, allowance: null }, userId)

    await t.step(
      "every write moves the household's sequence once, and archiving a parent writes one audit row for it and its child (D2)",
      async () => {
        const { groupId, owner } = await team(sql)
        const before = await nextSequence(sql, groupId)

        const { category: food } = await create(owner, groupId)
        const { category: groceries } = await create(owner, groupId, {
          name: "Groceries",
          parentId: food.id,
        })
        const at = { groupId, id: food.id, allowance: null }
        await categories.update({ ...at, ...fields, name: "Meals", expectedVersion: 1 }, owner)
        const archived = await categories.archive(
          { ...at, archived: true, expectedVersion: 2 },
          owner,
        )
        const back = await categories.archive({ ...at, archived: false, expectedVersion: 3 }, owner)

        expect(archived.children.map((child) => child.id)).toEqual([groceries.id])
        expect(archived.children[0].archivedAt).toBeInstanceOf(Date)
        expect(archived.children[0].changeSequence).toBe(archived.category.changeSequence)
        expect(back.children.map((child) => child.archivedAt)).toEqual([null])
        expect(await nextSequence(sql, groupId)).toBe(before + 5n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${groupId} AND event_kind LIKE 'category.%' ORDER BY aggregate_version
        `
        expect(outbox.map((row) => row.eventKind)).toEqual([
          "category.created",
          "category.created",
          "category.updated",
          "category.archived",
          "category.unarchived",
        ])
        const audit = await sql<{ eventKind: string; entityId: string; details: object }[]>`
          SELECT event_kind, entity_id, details FROM audit_events
          WHERE group_id = ${groupId} AND entity_type = 'category' ORDER BY id
        `
        expect(audit.map(({ eventKind, details }) => [eventKind, details])).toEqual([
          ["category.created", { name: "Food" }],
          ["category.created", { name: "Groceries" }],
          ["category.updated", { name: "Meals", from: "Food" }],
          ["category.archived", { name: "Meals", children: 1 }],
          ["category.unarchived", { name: "Meals", children: 1 }],
        ])
        expectVersion7Ids([food, groceries])
      },
    )

    await t.step(
      "answers another household's category or parent id as not found and leaves it as it was (R17)",
      async () => {
        const mine = await team(sql)
        const theirs = await team(sql)
        const { category: foreign } = await create(theirs.owner, theirs.groupId)
        const { category: own } = await create(mine.owner, mine.groupId, { name: "Mine" })
        const at = { groupId: mine.groupId, id: foreign.id, expectedVersion: 1, allowance: null }

        const refusals = [
          await categories.get(mine.groupId, foreign.id),
          await refusal(categories.update({ ...at, ...fields, name: "Taken" }, mine.owner)),
          await refusal(categories.archive({ ...at, archived: true }, mine.owner)),
          await refusal(create(mine.owner, mine.groupId, { name: "Child", parentId: foreign.id })),
          await refusal(
            categories.update(
              { ...at, id: own.id, ...fields, name: "Mine", parentId: foreign.id },
              mine.owner,
            ),
          ),
        ]

        expect(refusals[0]).toBeNull()
        for (const error of refusals.slice(1)) {
          expect(error).toMatchObject({ code: "CATEGORY_NOT_FOUND" })
        }
        const [row] = await sql`
          SELECT name, archived_at, version FROM categories WHERE id = ${foreign.id}
        `
        expect(row).toEqual({ name: "Food", archivedAt: null, version: 1 })
        expect((await categories.get(mine.groupId, own.id))?.parentId).toBeNull()
      },
    )

    await t.step(
      "a viewer cannot write a category and a stranger sees no household (R16)",
      async () => {
        const { groupId, owner, viewer, stranger } = await team(sql)
        const { category } = await create(owner, groupId)
        const at = { groupId, id: category.id, expectedVersion: 1, allowance: null }

        for (const [user, code] of [[viewer, "ROLE_INSUFFICIENT"], [stranger, "GROUP_NOT_FOUND"]]) {
          const userId = user as number
          expect(await refusal(create(userId, groupId, { name: "Other" }))).toMatchObject({ code })
          expect(
            await refusal(categories.update({ ...at, ...fields, name: "Late" }, userId)),
          ).toMatchObject({ code })
          expect(await refusal(categories.archive({ ...at, archived: true }, userId)))
            .toMatchObject({ code })
        }
        expect(await categories.list(groupId)).toMatchObject([{ name: "Food", version: 1 }])
      },
    )

    await t.step(
      "refuses a second level, a kind change under a parent and a sibling's folded name (R13, D3)",
      async () => {
        const { groupId, owner } = await team(sql)
        const { category: food } = await create(owner, groupId)
        const { category: groceries } = await create(owner, groupId, {
          name: "Groceries",
          parentId: food.id,
        })

        expect(await refusal(create(owner, groupId, { name: "Bread", parentId: groceries.id })))
          .toMatchObject({ code: "CATEGORY_TREE_INVALID" })
        expect(
          await refusal(
            categories.update(
              {
                groupId,
                id: food.id,
                ...fields,
                kind: CategoryKind.INCOME,
                expectedVersion: 1,
              },
              owner,
            ),
          ),
        ).toMatchObject({ code: "CATEGORY_TREE_INVALID" })
        expect(await refusal(create(owner, groupId, { name: "fóod" }))).toMatchObject({
          code: "CATEGORY_NAME_TAKEN",
        })
        // The same name under another parent, or of the other kind, is no sibling.
        await create(owner, groupId, { name: "Food", kind: CategoryKind.INCOME })
        await create(owner, groupId, { name: "Food", parentId: food.id })
        expect(await categories.count(groupId)).toBe(4)
      },
    )

    await t.step(
      "the table refuses deleting a parent, a parent of another household and a colour or icon outside the rules",
      async () => {
        const { groupId, owner } = await team(sql)
        const other = await team(sql)
        const { category: food } = await create(owner, groupId)
        await create(owner, groupId, { name: "Groceries", parentId: food.id })
        const { category: foreign } = await create(other.owner, other.groupId)
        const insert = (more: Record<string, unknown>) =>
          sql`
            INSERT INTO categories ${
            sql({
              id: uuidV7(),
              group_id: groupId,
              name: "Raw",
              kind: 1,
              icon: "tag",
              color: "#4b5563",
              change_sequence: 1,
              ...more,
            })
          }
          `

        // 23001 is Postgres's restrict_violation: the parent stays while a child names it.
        expect(await refusal(sql`DELETE FROM categories WHERE id = ${food.id}`)).toMatchObject({
          code: "23001",
        })
        expect(await refusal(insert({ parent_id: foreign.id }))).toMatchObject({ code: "23503" })
        expect(await refusal(insert({ color: "#C2410C" }))).toMatchObject({ code: "23514" })
        expect(await refusal(insert({ icon: "<svg>" }))).toMatchObject({ code: "23514" })
        expect(await refusal(insert({ kind: 3 }))).toMatchObject({ code: "23514" })
        // The household's own delete takes its whole tree with it.
        await sql`DELETE FROM groups WHERE id = ${groupId}`
        expect(await categories.list(groupId)).toEqual([])
      },
    )

    await t.step(
      "a child cannot come back alone while its parent is archived (D2)",
      async () => {
        const { groupId, owner } = await team(sql)
        const { category: food } = await create(owner, groupId)
        const { category: groceries } = await create(owner, groupId, {
          name: "Groceries",
          parentId: food.id,
        })
        await categories.archive(
          { groupId, id: food.id, archived: true, expectedVersion: 1, allowance: null },
          owner,
        )

        expect(
          await refusal(
            categories.archive(
              { groupId, id: groceries.id, archived: false, expectedVersion: 2, allowance: null },
              owner,
            ),
          ),
        ).toMatchObject({ code: "CATEGORY_PARENT_ARCHIVED" })
        expect((await categories.get(groupId, groceries.id))?.archivedAt).toBeInstanceOf(Date)
      },
    )

    await t.step("the cap holds when two creates race for the last live place", async () => {
      const { groupId, owner, editor } = await team(sql)
      await fill(sql, groupId, owner, CATEGORY_MAX_PER_GROUP - 1)

      const outcomes = await Promise.allSettled([
        create(owner, groupId, { name: "One" }),
        create(editor, groupId, { name: "Two" }),
      ])

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"])
      const rejected = outcomes.find((outcome) => outcome.status === "rejected")
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        code: "CATEGORY_LIMIT_REACHED",
      })
      expect(await categories.count(groupId)).toBe(CATEGORY_MAX_PER_GROUP)
    })

    await t.step(
      "the plan's cap holds when two creates race for its last place, and an unarchive counts (D1)",
      async () => {
        const { groupId, owner, editor } = await team(sql)
        const write = (userId: number, name: string) =>
          categories.create({ groupId, id: uuidV7(), ...fields, name, allowance: 1 }, userId)

        const outcomes = await Promise.allSettled([write(owner, "One"), write(editor, "Two")])

        expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"])
        const rejected = outcomes.find((outcome) => outcome.status === "rejected")
        expect((rejected as PromiseRejectedResult).reason).toMatchObject({
          code: "PLAN_LIMIT_REACHED",
        })
        const [live] = await categories.list(groupId)
        await categories.archive(
          { groupId, id: live.id, archived: true, expectedVersion: 1, allowance: 1 },
          owner,
        )
        await write(owner, "Three")
        expect(
          await refusal(
            categories.archive(
              { groupId, id: live.id, archived: false, expectedVersion: 2, allowance: 1 },
              owner,
            ),
          ),
        ).toMatchObject({ code: "PLAN_LIMIT_REACHED" })
        expect(await categories.count(groupId)).toBe(1)
      },
    )

    await t.step(
      "a retried create is answered with the first category and stores one row",
      async () => {
        const { groupId, owner } = await team(sql)
        const input = { groupId, id: uuidV7(), ...fields, allowance: null }

        const first = await categories.create(input, owner)
        const again = await categories.create(input, owner)

        expect([first.created, again.created]).toEqual([true, false])
        expect(again.category.id).toBe(first.category.id)
        expect(await refusal(categories.create({ ...input, name: "Other" }, owner)))
          .toMatchObject({ code: "ID_ALREADY_EXISTS" })
        expect(await categories.list(groupId)).toHaveLength(1)
      },
    )
  })
})

Deno.test("the operator's categories read counts live and archived categories by kind and household, and carries no category name", async () => {
  await withSchema(async (sql) => {
    const categories = new PostgresCategoryRepository(sql)
    const { groupId, owner } = await team(sql)
    const add = (more: Partial<typeof fields>) =>
      categories.create({ groupId, id: uuidV7(), ...fields, ...more, allowance: null }, owner)
    const { category: therapy } = await add({ name: "Therapy" })
    await add({ name: "Sessions", parentId: therapy.id })
    const { category: salary } = await add({ name: "Salary", kind: CategoryKind.INCOME })
    await categories.archive(
      { groupId, id: salary.id, archived: true, expectedVersion: 1, allowance: null },
      owner,
    )

    const overview = await readAdminCategories(sql)

    expect(overview).toEqual({
      categories: 2,
      archived: 1,
      subcategories: 1,
      households: 1,
      byKind: [{ kind: CategoryKind.EXPENSE, categories: 2 }],
      topHouseholds: [{ groupId, groupName: "Team", categories: 2 }],
    })
    const text = JSON.stringify(overview)
    expect(text).not.toContain("Therapy")
    expect(text).not.toContain("Salary")
    expect(text).not.toContain("utensils")
  })
})
