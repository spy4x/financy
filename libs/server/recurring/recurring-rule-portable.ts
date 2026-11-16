import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import {
  parseRecurringRuleExportEntry,
  type RecurringRuleExportEntry,
  recurringRuleReferenceProblems,
} from "@domain/recurring"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at 23 columns a row. */
const WRITE_BATCH = 1_000

/** Postgres's type id of `date`, so the skipped dates go in as `date[]`. */
const DATE_TYPE = 1082

/**
 * Repeating rules in a household's export file: every live rule, with the day the job made its
 * entries through and why it paused, so an import never makes again the entries the file's
 * transactions already hold. Deleted rules stay behind. On import each rule gets a new id and
 * names the new ids of its account and category, which the registry writes before it. A rule whose
 * account or category the file lacks refuses the whole import; anything else a rule names is kept
 * as the household had it (`recurringRuleReferenceProblems`). They count against the new
 * household's `maxRecurringRules`.
 */
export const recurringRulePortable = portable<RecurringRuleExportEntry>({
  kind: `recurringRules`,
  one: `repeating entry`,
  other: `repeating entries`,
  limit: `maxRecurringRules`,
  parse: parseRecurringRuleExportEntry,
  async *read(sql, groupId) {
    const rows = await sql<
      (Omit<RecurringRuleExportEntry, `amount` | `accountAmount`> & {
        amount: string
        accountAmount: string | null
      })[]
    >`
      SELECT id, account_id, category_id, kind, amount::text AS amount,
        account_amount::text AS account_amount, currency, memo, rrule,
        to_char(start_date, 'YYYY-MM-DD') AS start_date,
        to_char(end_date, 'YYYY-MM-DD') AS end_date, count,
        ARRAY(
          SELECT to_char(skipped, 'YYYY-MM-DD') FROM unnest(skipped_dates) AS skipped
          ORDER BY skipped
        ) AS skipped_dates,
        to_char(made_through, 'YYYY-MM-DD') AS made_through, paused_reason, created_at, updated_at
      FROM recurring_rules WHERE group_id = ${groupId} AND deleted_at IS NULL
      ORDER BY created_at, id
    `
    yield rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
      accountAmount: row.accountAmount === null ? null : Number(row.accountAmount),
    }))
  },
  async write(sql, rules, context) {
    const ids = new Map<string, string>()
    if (rules.length === 0) return ids
    const newAccount = (fileId: string) => context.newIdOf(`accounts`, fileId)
    const newCategory = (fileId: string) => context.newIdOf(`categories`, fileId)
    const problems = recurringRuleReferenceProblems(rules, {
      account: (fileId) => newAccount(fileId) !== undefined,
      category: (fileId) => newCategory(fileId) !== undefined,
    })
    if (problems.length > 0) {
      throw new GroupImportError(
        problems.slice(0, GROUP_IMPORT_PROBLEMS_MAX).map(({ index, problem, issue }) => ({
          kind: `invalid`,
          where: `Repeating entry ${index + 1}`,
          problem,
          place: { part: `recurringRules`, index: index + 1 },
          issue,
        })),
        problems.length,
      )
    }
    const rows = rules.map((rule) => {
      const id = uuidV7()
      ids.set(rule.id, id)
      return {
        id,
        group_id: context.groupId,
        account_id: newAccount(rule.accountId)!,
        category_id: newCategory(rule.categoryId)!,
        kind: rule.kind,
        amount: rule.amount,
        account_amount: rule.accountAmount,
        currency: rule.currency,
        memo: rule.memo,
        rrule: rule.rrule,
        start_date: rule.startDate,
        end_date: rule.endDate,
        count: rule.count,
        skipped_dates: sql.array(rule.skippedDates, DATE_TYPE),
        made_through: rule.madeThrough,
        paused_reason: rule.pausedReason,
        version: 1,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: rule.createdAt,
        updated_at: rule.updatedAt,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO recurring_rules ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
