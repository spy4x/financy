import type postgres from "postgres"
import { effectivePlanId, entitlementsOf, type Plan, PlanError } from "@domain/billing"
import { NoteError } from "@domain/notes"
import { CategoryError, STARTER_CATEGORIES, type StarterCategory } from "@domain/categories"
import { PostgresCategoryRepository } from "../categories/postgres-category-repository.ts"
import { readMailReader } from "../mail/reader.ts"
import { translatorFor } from "../mail/mail.ts"
import { PostgresBillingRepository } from "../billing/postgres-billing-repository.ts"
import { PostgresNoteRepository } from "../notes/postgres-note-repository.ts"
import { enqueueJob, type JobHandler } from "./jobs.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** The job that gives a new account its starter data. Its aggregate id is the request's id. */
export const STARTER_DATA_JOB = "onboarding.starter-data"

/** The title of the note every new account starts with. */
export const WELCOME_NOTE_TITLE = "Welcome"

/** The body of the welcome note: what the app is and the three things to try first. */
export const WELCOME_NOTE_BODY = [
  `This is a note. Edit it, delete it or write your own: it is yours.`,
  ``,
  `Notes live in a group. Your first group is called Personal; rename it or make more from the group menu.`,
  `Invite someone to a group and they see the same notes, live, with the role you give them.`,
].join(`\n`)

/**
 * Records that a new account is owed its starter data and queues the job that gives it, both in the
 * caller's transaction, the sign-up's own. The job runs in the worker, so a slow or failing job
 * never holds up or undoes a sign-up. The outbox names a job by a UUID, so the job points at this
 * row rather than at the user.
 */
export async function scheduleStarterData(tx: postgres.Sql, userId: number): Promise<void> {
  const id = uuidV7()
  await tx`INSERT INTO starter_data_requests (id, user_id) VALUES (${id}, ${userId})`
  await enqueueJob(tx, STARTER_DATA_JOB, id, { inMs: 0 })
}

/** What the job needs to find a group's note cap; the defaults are a deployment without billing. */
export interface StarterDataPlan {
  /** `true` when the deployment takes payments, so the free plan's cap applies. */
  billingEnabled?: boolean
  /** The billing setup's grace period, which `effectivePlanId` counts. */
  graceDays?: number
  /**
   * More starter data for the account, written before the welcome note: the public demo's sample
   * groups (docs/demo.md). It must add nothing when it runs again for the same account.
   */
  sampleData?: ((userId: number) => Promise<void>) | null
  /**
   * The plan catalog the cap is read from, `PLANS` unless a test passes its own. A free plan that
   * allows no note gives a new group nothing, so it starts empty.
   */
  plans?: readonly Plan[]
}

/**
 * Writes `plan.sampleData`, if any, and creates the welcome note in the person's first group, then
 * sets `done_at`. The note's id is the
 * request's id, so a job that runs twice (a forced retry, a crash between the note and the marker)
 * adds one note: the second insert finds the first and does nothing. Once `done_at` is set the job
 * does not look at the notes again, so a note the person deleted stays deleted. A person with no
 * active group left, or whose group is at its plan's note cap, gets nothing, and the request is
 * closed.
 */
export function starterDataJob(sql: postgres.Sql, plan: StarterDataPlan = {}): JobHandler {
  const billing = new PostgresBillingRepository(sql)
  return async (event) => {
    const [request] = await sql<{ userId: number; doneAt: Date | null }[]>`
      SELECT user_id AS "userId", done_at AS "doneAt"
      FROM starter_data_requests
      WHERE id = ${event.aggregateId}
    `
    if (!request || request.doneAt) return
    await plan.sampleData?.(request.userId)
    const [group] = await sql<{ id: string }[]>`
      SELECT groups.id
      FROM group_members
      INNER JOIN groups ON groups.id = group_members.group_id AND groups.deleted_at IS NULL
      INNER JOIN users ON users.id = group_members.user_id AND users.deleted_at IS NULL
      WHERE group_members.user_id = ${request.userId}
      ORDER BY groups.created_at, groups.id
      LIMIT 1
    `
    if (group) {
      try {
        // The cap the API's gate would apply: none while billing is off.
        const allowance = plan.billingEnabled
          ? entitlementsOf(
            effectivePlanId(
              await billing.get(group.id),
              new Date(),
              plan.graceDays ?? 0,
              plan.plans,
            ),
            true,
            plan.plans,
          ).limits.maxNotes
          : null
        await new PostgresNoteRepository(sql).create(
          {
            groupId: group.id,
            id: event.aggregateId,
            title: WELCOME_NOTE_TITLE,
            body: WELCOME_NOTE_BODY,
          },
          request.userId,
          allowance,
        )
      } catch (error) {
        // The group was deleted, the person was removed, or the group is at its plan's note cap:
        // nothing to seed, and a retry would only meet the same answer.
        if (!(error instanceof NoteError || error instanceof PlanError)) throw error
      }
      await writeStarterCategories(sql, group.id, request.userId, event.aggregateId)
    }
    await sql`UPDATE starter_data_requests SET done_at = now() WHERE id = ${event.aggregateId}`
  }
}

/**
 * The id of the starter category at `index`, derived from the request's id: the request's
 * timestamp, then a SHA-256 of the request id and the index, shaped as a version 7 UUID. A job that
 * runs again makes the same ids, so the create finds each category it wrote and adds none.
 */
export async function starterCategoryId(requestId: string, index: number): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(`SHA-256`, new TextEncoder().encode(`${requestId}:${index}`)),
  )
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, `0`)).join(``)
  const time = requestId.replaceAll(`-`, ``).slice(0, 12)
  const variant = ((parseInt(hex[15], 16) & 0x3) | 0x8).toString(16)
  const tail = `7${hex.slice(0, 3)}${variant}${hex.slice(3, 18)}`
  return `${time.slice(0, 8)}-${time.slice(8)}-${tail.slice(0, 4)}-${tail.slice(4, 8)}-${
    tail.slice(8, 20)
  }`
}

/**
 * Writes the starter categories into the household, named in the person's language, with the
 * person as their creator. They are the app's own set, not the person's additions, so no plan cap
 * applies (`allowance: null`); Financy's own cap still does. A category the household refuses
 * (the group is gone, the person was removed, a name or an id already taken) is skipped, and its
 * children with it.
 */
async function writeStarterCategories(
  sql: postgres.Sql,
  groupId: string,
  userId: number,
  requestId: string,
): Promise<void> {
  const { language } = await readMailReader(sql, userId)
  const t = translatorFor(language)
  const categories = new PostgresCategoryRepository(sql)
  let index = 0
  const write = async (category: StarterCategory, parentId: string | null) => {
    const id = await starterCategoryId(requestId, index++)
    try {
      await categories.create(
        {
          groupId,
          id,
          name: t.t(category.key),
          kind: category.kind,
          icon: category.icon,
          color: category.color,
          parentId,
          allowance: null,
          requestId,
        },
        userId,
      )
    } catch (error) {
      if (!(error instanceof CategoryError)) throw error
      // Its children's ids are still counted, so every later category keeps its id on a rerun.
      index += category.children?.length ?? 0
      return
    }
    for (const child of category.children ?? []) await write(child, id)
  }
  for (const category of STARTER_CATEGORIES) await write(category, null)
}
