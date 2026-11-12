import type postgres from "postgres"
import {
  assertCanWriteCategories,
  assertCategoryRoom,
  assertNoCategoryProblem,
  type Category,
  CATEGORY_EVENTS,
  type CategoryArchiveInput,
  categoryArchivePlan,
  type CategoryArchiveResult,
  type CategoryCreateInput,
  CategoryError,
  type CategoryNode,
  categoryProblem,
  type CategoryRepository,
  type CategoryUpdateInput,
  CategoryVersionConflictError,
  type CategoryWriteResult,
} from "@domain/categories"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { writeAuditEvent } from "@server/groups/audit.ts"
import type { AuditDetails, GroupRole } from "@domain/groups"
import { assertRoomFor } from "@domain/billing"

/** A row as postgres.js reads it: the BIGINT sequence comes as decimal text. */
interface CategoryRow extends postgres.Row, Category {}

/**
 * Records a category change on its group. A group deleted since the role check is answered as a
 * missing group, and the write rolls back with it.
 */
async function recordCategoryChange(
  sql: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  eventKind: string,
): Promise<string> {
  try {
    return await recordGroupChange(sql, groupId, actorId, eventKind)
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new CategoryError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Checks, in the write's own transaction, that the actor may still change the categories, and
 * returns their role. The lock it takes on the group makes every other write of the household wait.
 */
async function assertWriterNow(
  transaction: postgres.TransactionSql,
  groupId: string,
  actorId: number,
): Promise<GroupRole> {
  try {
    const role = await lockActorRole(transaction, groupId, actorId)
    assertCanWriteCategories(role)
    return role as GroupRole
  } catch (error) {
    if (error instanceof GroupNotActiveError) {
      throw new CategoryError("GROUP_NOT_FOUND", "Group not found")
    }
    throw error
  }
}

/**
 * Categories in Postgres. Every write runs in one transaction that checks the actor's role on the
 * locked membership row (`lockActorRole`), reads the household's categories under that lock,
 * checks the tree rules on them (`categoryProblem`), records the change on the group and writes
 * one audit event. Every statement names the group, so an id from another household matches no
 * row and answers `CATEGORY_NOT_FOUND`; the table's foreign key on `(group_id, parent_id)` holds
 * the same for a parent even if a statement forgot it.
 *
 * The caps are counted after the write, in the same transaction: a household's live categories
 * against `CATEGORY_MAX_PER_GROUP` and the plan's `allowance`, all of them against
 * `CATEGORY_MAX_STORED`.
 */
export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async list(groupId: string): Promise<Category[]> {
    return await this.sql<CategoryRow[]>`
      SELECT ${this.columns()} FROM categories
      WHERE group_id = ${groupId}
      ORDER BY kind, lower(name), id
    `
  }

  async get(groupId: string, id: string): Promise<Category | null> {
    const [row] = await this.sql<CategoryRow[]>`
      SELECT ${this.columns()} FROM categories WHERE id = ${id} AND group_id = ${groupId}
    `
    return row ?? null
  }

  /** How many categories of the household are in use: what the plan's `maxCategories` counts. */
  async count(groupId: string): Promise<number> {
    const [{ count }] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM categories
      WHERE group_id = ${groupId} AND archived_at IS NULL
    `
    return count
  }

  async create(input: CategoryCreateInput, actorId: number): Promise<CategoryWriteResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresCategoryRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      // A retry of a create that landed finds its own row and is answered with it, before any rule
      // that the row itself would now break.
      const [taken] = await transaction<CategoryRow[]>`
        SELECT ${repository.columns()} FROM categories WHERE id = ${input.id}
      `
      if (taken) {
        if (
          taken.groupId === input.groupId && taken.createdByUserId === actorId &&
          taken.name === input.name && taken.kind === input.kind && taken.icon === input.icon &&
          taken.color === input.color && taken.parentId === input.parentId
        ) {
          return { category: taken, created: false }
        }
        throw new CategoryError("ID_ALREADY_EXISTS", "Category id is already in use")
      }
      const household = await repository.nodes(input.groupId)
      assertNoCategoryProblem(categoryProblem(household, { ...input, archived: false }))
      const inserted = (
        await transaction<{ id: string }[]>`
          INSERT INTO categories (
            id, group_id, parent_id, name, kind, icon, color, change_sequence,
            created_by_user_id, updated_by_user_id
          ) VALUES (
            ${input.id}, ${input.groupId}, ${input.parentId}, ${input.name}, ${input.kind},
            ${input.icon}, ${input.color}, 1, ${actorId}, ${actorId}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      )[0]
      if (!inserted) throw new CategoryError("ID_ALREADY_EXISTS", "Category id is already in use")
      await repository.assertRoom(input.groupId, input.allowance, role)
      await repository.audit(CATEGORY_EVENTS.created, input, actorId, { name: input.name })
      const [category] = await repository.stamp(input, [input.id], actorId, CATEGORY_EVENTS.created)
      return { category, created: true }
    })
  }

  async update(input: CategoryUpdateInput, actorId: number): Promise<Category> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresCategoryRepository(transaction)
      await assertWriterNow(transaction, input.groupId, actorId)
      const current = await repository.lockCurrent(input)
      const household = await repository.nodes(input.groupId)
      assertNoCategoryProblem(
        categoryProblem(household, { ...input, archived: current.archivedAt !== null }),
      )
      await transaction`
        UPDATE categories
        SET name = ${input.name}, kind = ${input.kind}, icon = ${input.icon},
            color = ${input.color}, parent_id = ${input.parentId}, version = version + 1,
            updated_by_user_id = ${actorId}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${input.id} AND group_id = ${input.groupId}
      `
      await repository.audit(CATEGORY_EVENTS.updated, input, actorId, {
        name: input.name,
        ...(current.name !== input.name && { from: current.name }),
      })
      const [category] = await repository.stamp(input, [input.id], actorId, CATEGORY_EVENTS.updated)
      return category
    })
  }

  async archive(input: CategoryArchiveInput, actorId: number): Promise<CategoryArchiveResult> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      const repository = new PostgresCategoryRepository(transaction)
      const role = await assertWriterNow(transaction, input.groupId, actorId)
      const current = await repository.lockCurrent(input)
      const household = await repository.nodes(input.groupId)
      const plan = categoryArchivePlan(household, input.id, input.archived)
      // Archiving an archived category keeps its first date; its children that were archived on
      // their own keep theirs, and only the ones in use follow it.
      await transaction`
        UPDATE categories
        SET archived_at = ${
        input.archived ? transaction`COALESCE(archived_at, CURRENT_TIMESTAMP)` : null
      },
            version = version + 1,
            updated_by_user_id = ${actorId},
            updated_at = CURRENT_TIMESTAMP
        WHERE group_id = ${input.groupId} AND id = ANY(${plan.ids}::uuid[])
      `
      if (plan.added > 0) await repository.assertRoom(input.groupId, input.allowance, role)
      const kind = input.archived ? CATEGORY_EVENTS.archived : CATEGORY_EVENTS.unarchived
      const followed = plan.ids.length - 1
      // One event for the parent and the children that followed it (D2).
      await repository.audit(kind, input, actorId, {
        name: current.name,
        ...(followed > 0 && { children: followed }),
      })
      const [category, ...children] = await repository.stamp(input, plan.ids, actorId, kind)
      return { category, children }
    })
  }

  /**
   * Refuses a write that just brought categories into use in a household past its caps: Financy's
   * own and the plan's `allowance`. Every live category counts, so the room left is checked as if
   * the last one came alone: `live - 1` must be below the plan's cap.
   */
  private async assertRoom(
    groupId: string,
    allowance: number | null,
    role: GroupRole,
  ): Promise<void> {
    const [{ live, stored }] = await this.sql<{ live: number; stored: number }[]>`
      SELECT count(*) FILTER (WHERE archived_at IS NULL)::int AS live, count(*)::int AS stored
      FROM categories WHERE group_id = ${groupId}
    `
    assertCategoryRoom(live, stored)
    assertRoomFor("maxCategories", allowance, live - 1, role)
  }

  /** The household's categories as the tree rules read them. */
  private async nodes(groupId: string): Promise<CategoryNode[]> {
    return await this.sql<CategoryNode[]>`
      SELECT id, name, kind, parent_id, archived_at IS NOT NULL AS archived
      FROM categories WHERE group_id = ${groupId}
    `
  }

  /**
   * Locks the category a write names and checks the version it was edited at. Throws
   * `CATEGORY_NOT_FOUND` for another group's or an unknown id, or
   * {@link CategoryVersionConflictError}.
   */
  private async lockCurrent(
    input: { groupId: string; id: string; expectedVersion: number },
  ): Promise<{ name: string; archivedAt: Date | null }> {
    const [current] = await this.sql<{ version: number; name: string; archivedAt: Date | null }[]>`
      SELECT version, name, archived_at FROM categories
      WHERE id = ${input.id} AND group_id = ${input.groupId}
      FOR UPDATE
    `
    if (!current) throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found")
    if (current.version !== input.expectedVersion) {
      throw new CategoryVersionConflictError(current.version)
    }
    return current
  }

  private async audit(
    eventKind: string,
    input: { groupId: string; id: string; requestId?: string },
    actorId: number,
    details: AuditDetails,
  ): Promise<void> {
    await writeAuditEvent(this.sql as postgres.TransactionSql, {
      eventKind,
      actorId,
      groupId: input.groupId,
      requestId: input.requestId,
      entityType: "category",
      entityId: input.id,
      details,
    })
  }

  /**
   * Records one change on the group for the categories written in this transaction, stores its
   * sequence on each and returns them as they now read, in the order of `ids`.
   */
  private async stamp(
    input: { groupId: string },
    ids: readonly string[],
    actorId: number,
    eventKind: string,
  ): Promise<Category[]> {
    const sequence = await recordCategoryChange(
      this.sql as postgres.TransactionSql,
      input.groupId,
      actorId,
      eventKind,
    )
    const rows = await this.sql<CategoryRow[]>`
      UPDATE categories SET change_sequence = ${sequence}::bigint
      WHERE group_id = ${input.groupId} AND id = ANY(${ids as string[]}::uuid[])
      RETURNING ${this.columns()}
    `
    const byId = new Map(rows.map((row) => [row.id, row]))
    return ids.map((id) => {
      const row = byId.get(id)
      if (!row) throw new Error(`Category ${id} vanished while its change was being recorded`)
      return row
    })
  }

  private columns() {
    return this.sql`
      categories.id,
      categories.group_id,
      categories.name,
      categories.kind,
      categories.icon,
      categories.color,
      categories.parent_id,
      categories.archived_at,
      categories.version,
      categories.change_sequence::text AS change_sequence,
      categories.created_by_user_id,
      categories.updated_by_user_id,
      categories.created_at,
      categories.updated_at
    `
  }
}
