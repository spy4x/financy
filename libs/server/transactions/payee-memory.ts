/**
 * Payee memory (`docs/imports.md`, "Payee memory"): the category a household last chose for a
 * payee when it saved a bank statement, which the next statement's preview suggests for that
 * payee's rows. The statement import kind reads it once per review and writes it once per save,
 * in the save's transaction, so a refused or cancelled save remembers nothing.
 *
 * @module
 */

import type postgres from "postgres"
import type { CategoryKind } from "@domain/categories"
import { PAYEE_KEY_MAX_LENGTH } from "@domain/transactions"
import { payeeKey } from "@spy4x/bank-statements"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Payees one statement remembers: well under Postgres's 65,535 parameters at five columns a row. */
const WRITE_BATCH = 1_000

/**
 * The key a payee is remembered by: `payeeKey`, cut to {@link PAYEE_KEY_MAX_LENGTH} UTF-16 code
 * units without splitting a character. `""` for a payee that leaves nothing, which is never
 * remembered or looked up.
 */
export function memoryKey(payee: string): string {
  let key = ``
  for (const char of payeeKey(payee)) {
    if (key.length + char.length > PAYEE_KEY_MAX_LENGTH) break
    key += char
  }
  return key.trimEnd()
}

/**
 * The live category the household remembers for each of `keys`, with its kind, in one query
 * however many rows a statement has. A payee whose category was archived since has none. Only
 * `groupId`'s memory is read, so another household's choices never show.
 */
export async function rememberedCategories(
  tx: postgres.TransactionSql,
  groupId: string,
  keys: readonly string[],
): Promise<Map<string, { id: string; kind: CategoryKind }>> {
  const wanted = [...new Set(keys.filter((key) => key !== ``))]
  if (wanted.length === 0) return new Map()
  const rows = await tx<{ payeeKey: string; id: string; kind: CategoryKind }[]>`
    SELECT payee_memory.payee_key, categories.id, categories.kind
    FROM payee_memory
    JOIN categories ON categories.group_id = payee_memory.group_id
      AND categories.id = payee_memory.category_id AND categories.archived_at IS NULL
    WHERE payee_memory.group_id = ${groupId} AND payee_memory.payee_key = ANY(${wanted}::text[])
  `
  return new Map(rows.map((row) => [row.payeeKey, { id: row.id, kind: row.kind }]))
}

/**
 * Remembers `choices` (category by payee key) for the household, the last choice winning over an
 * earlier one, as batched upserts. The caller passes one category per key, already checked to be
 * the household's.
 */
export async function rememberPayees(
  tx: postgres.TransactionSql,
  groupId: string,
  actorId: number,
  choices: ReadonlyMap<string, string>,
): Promise<void> {
  const rows = [...choices].map(([key, categoryId]) => ({
    id: uuidV7(),
    group_id: groupId,
    payee_key: key,
    category_id: categoryId,
    updated_by_user_id: actorId,
  }))
  for (let start = 0; start < rows.length; start += WRITE_BATCH) {
    await tx`
      INSERT INTO payee_memory ${tx(rows.slice(start, start + WRITE_BATCH))}
      ON CONFLICT (group_id, payee_key) DO UPDATE
      SET category_id = EXCLUDED.category_id,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = CURRENT_TIMESTAMP
    `
  }
}
