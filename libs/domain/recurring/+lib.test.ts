import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import {
  assertCanReadRecurringRules,
  assertCanWriteRecurringRules,
  assertRuleReferences,
  isOccurrence,
  parseRecurrence,
  parseRecurringRuleRequest,
  RECURRING_COUNT_MAX,
  RECURRING_INTERVAL_MAX,
  RECURRING_RRULE_MAX_LENGTH,
  RECURRING_SKIPPED_MAX,
  recurringRuleCreatePayloadSchema,
  recurringRuleUpdatePayloadSchema,
  skipDate,
} from "./+lib.ts"

const groupId = `019a5b0e-1af5-7f04-8ae4-b1ee5d111002`
const id = `019a5b0e-1af5-7f04-8ae4-b1ee5d113001`
const accountId = `019a5b0e-1af5-7f04-8ae4-b1ee5d112001`
const categoryId = `019a5b0e-1af5-7f04-8ae4-b1ee5d114001`
/** Rent: 1200.00 USD on the 1st of every month from November. */
const rent = {
  groupId,
  id,
  accountId,
  categoryId,
  kind: TransactionKind.EXPENSE,
  amount: 120000,
  currency: `USD`,
  rrule: `FREQ=MONTHLY;BYMONTHDAY=1`,
  startDate: `2026-11-01`,
}

/** The code and the failed fields of the error `run` throws, or `undefined` when it does not. */
function refusalOf(run: () => unknown): { code?: string; fields?: unknown } | undefined {
  try {
    run()
  } catch (error) {
    const { code, fields } = error as { code?: string; fields?: unknown }
    return { code, fields }
  }
  return undefined
}

/** The field code a repeat is refused with, or `undefined` when it is accepted. */
function repeatRefusal(text: string, startDate = `2026-11-01`): string | undefined {
  const refusal = refusalOf(() => parseRecurrence(text, startDate))
  return (refusal?.fields as Record<string, { code: string }> | undefined)?.[
    startDate.endsWith(`-02-29`) ? `startDate` : `rrule`
  ]?.code
}

describe(`the repeat of a rule`, () => {
  it(`refuses a monthly day 29, 30 or 31 and accepts 1 to 28 and the last day`, () => {
    for (const day of [29, 30, 31, 0, -2]) {
      expect(repeatRefusal(`FREQ=MONTHLY;BYMONTHDAY=${day}`)).toBe(`invalid`)
    }
    expect(parseRecurrence(`FREQ=MONTHLY;BYMONTHDAY=-1`, `2026-11-01`))
      .toBe(`FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1`)
    expect(parseRecurrence(`freq=monthly;bymonthday=1,15,28`, `2026-11-01`))
      .toBe(`FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1,15,28`)
  })

  it(`refuses a monthly repeat without days or with weekdays, and keeps a day named twice once`, () => {
    expect(repeatRefusal(`FREQ=MONTHLY`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=MONTHLY;BYDAY=1MO`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1`)).toBe(`invalid`)
    expect(parseRecurrence(`FREQ=MONTHLY;BYMONTHDAY=1,1`, `2026-11-01`))
      .toBe(`FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`)
  })

  it(`refuses a weekly weekday with a number, a weekday twice and a weekly repeat without weekdays`, () => {
    expect(repeatRefusal(`FREQ=WEEKLY;BYDAY=1MO`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=WEEKLY;BYDAY=MO,MO`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=WEEKLY`)).toBe(`invalid`)
    expect(parseRecurrence(`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`, `2026-11-01`))
      .toBe(`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`)
  })

  it(`takes a daily and a yearly repeat with no days, and refuses days on them`, () => {
    expect(parseRecurrence(`FREQ=DAILY`, `2026-11-01`)).toBe(`FREQ=DAILY;INTERVAL=1`)
    expect(parseRecurrence(`FREQ=YEARLY`, `2026-11-01`)).toBe(`FREQ=YEARLY;INTERVAL=1`)
    expect(repeatRefusal(`FREQ=DAILY;BYMONTHDAY=3`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=YEARLY;BYMONTHDAY=3`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=YEARLY;BYDAY=MO`)).toBe(`invalid`)
  })

  it(`refuses a yearly repeat that starts on 29 February, which most years lack`, () => {
    expect(repeatRefusal(`FREQ=YEARLY`, `2028-02-29`)).toBe(`invalid`)
    expect(parseRecurrence(`FREQ=MONTHLY;BYMONTHDAY=-1`, `2028-02-29`)).toContain(`MONTHLY`)
  })

  it(`refuses COUNT and UNTIL in the text, as the end is the rule's own field`, () => {
    expect(repeatRefusal(`FREQ=DAILY;COUNT=3`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=DAILY;UNTIL=20261231`)).toBe(`invalid`)
  })

  it(`refuses an interval past ${RECURRING_INTERVAL_MAX}, BYMONTH, BYSETPOS, a week start and broken text`, () => {
    expect(parseRecurrence(`FREQ=DAILY;INTERVAL=${RECURRING_INTERVAL_MAX}`, `2026-11-01`))
      .toBe(`FREQ=DAILY;INTERVAL=${RECURRING_INTERVAL_MAX}`)
    expect(repeatRefusal(`FREQ=DAILY;INTERVAL=${RECURRING_INTERVAL_MAX + 1}`)).toBe(`max`)
    expect(repeatRefusal(`FREQ=YEARLY;BYMONTH=3`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=WEEKLY;BYDAY=MO;WKST=SU`)).toBe(`invalid`)
    expect(repeatRefusal(`FREQ=HOURLY`)).toBe(`invalid`)
    expect(repeatRefusal(``)).toBe(`invalid`)
    expect(repeatRefusal(`not a rule`)).toBe(`invalid`)
  })
})

describe(`a rule request`, () => {
  it(`stores the repeat as formatRrule writes it and trims the memo`, () => {
    expect(
      parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, {
        ...rent,
        rrule: `RRULE:freq=monthly;bymonthday=1`,
        memo: `  Rent  `,
      }),
    ).toMatchObject({ rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`, memo: `Rent` })
  })

  it(`refuses an end date and a count together`, () => {
    expect(
      refusalOf(() =>
        parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, {
          ...rent,
          endDate: `2027-11-01`,
          count: 12,
        })
      ),
    ).toEqual({ code: `INVALID_REQUEST`, fields: { count: { code: `invalid` } } })
  })

  it(`refuses an end date before the start, and takes one on the start`, () => {
    expect(
      refusalOf(() =>
        parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, {
          ...rent,
          endDate: `2026-10-31`,
        })
      ),
    ).toEqual({
      code: `INVALID_REQUEST`,
      fields: { endDate: { code: `after`, values: { rule: `2026-11-01` } } },
    })
    expect(
      parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, {
        ...rent,
        endDate: `2026-11-01`,
      }),
    ).toMatchObject({ endDate: `2026-11-01` })
  })

  it(`refuses a count of 0 or past ${RECURRING_COUNT_MAX}, a repeat past ${RECURRING_RRULE_MAX_LENGTH} characters and every field the job sets`, () => {
    for (
      const payload of [
        { ...rent, count: 0 },
        { ...rent, count: RECURRING_COUNT_MAX + 1 },
        { ...rent, rrule: `FREQ=DAILY;${`X`.repeat(RECURRING_RRULE_MAX_LENGTH)}` },
        { ...rent, startDate: `2026-02-30` },
        { ...rent, madeThrough: `2026-11-01` },
        { ...rent, pausedReason: 1 },
        { ...rent, skippedDates: [] },
        { ...rent, amount: -5 },
      ]
    ) {
      expect(
        refusalOf(() => parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, payload))
          ?.code,
      ).toBe(`INVALID_REQUEST`)
    }
    expect(
      parseRecurringRuleRequest(recurringRuleCreatePayloadSchema, {
        ...rent,
        count: RECURRING_COUNT_MAX,
      }),
    ).toMatchObject({ count: RECURRING_COUNT_MAX })
  })

  it(`needs the memo and the version on an update`, () => {
    expect(
      refusalOf(() =>
        parseRecurringRuleRequest(recurringRuleUpdatePayloadSchema, { ...rent, version: 1 })
      )?.code,
    ).toBe(`INVALID_REQUEST`)
    expect(
      parseRecurringRuleRequest(recurringRuleUpdatePayloadSchema, {
        ...rent,
        memo: ``,
        version: 1,
      }),
    ).toMatchObject({ version: 1 })
  })
})

describe(`who may touch a household's rules`, () => {
  it(`lets every member read, an editor or above write, and tells a stranger nothing (R16)`, () => {
    expect(refusalOf(() => assertCanReadRecurringRules(GroupRole.VIEWER))).toBeUndefined()
    expect(refusalOf(() => assertCanWriteRecurringRules(GroupRole.VIEWER))?.code)
      .toBe(`ROLE_INSUFFICIENT`)
    expect(refusalOf(() => assertCanWriteRecurringRules(GroupRole.EDITOR))).toBeUndefined()
    expect(refusalOf(() => assertCanWriteRecurringRules(null))?.code).toBe(`GROUP_NOT_FOUND`)
  })
})

describe(`what a rule's entries point at`, () => {
  const fields = { kind: TransactionKind.EXPENSE, amount: 1000, currency: `USD` }
  const found = {
    account: { currency: `USD` },
    category: { kind: CategoryKind.EXPENSE },
  }

  it(`answers another household's account or category as not found (R17)`, () => {
    expect(
      refusalOf(() =>
        assertRuleReferences({ ...fields, accountAmount: null }, { ...found, account: null })
      )?.code,
    ).toBe(`ACCOUNT_NOT_FOUND`)
    expect(
      refusalOf(() =>
        assertRuleReferences({ ...fields, accountAmount: null }, { ...found, category: null })
      )?.code,
    ).toBe(`CATEGORY_NOT_FOUND`)
  })

  it(`refuses a stated account amount that differs in the account's own currency`, () => {
    expect(refusalOf(() => assertRuleReferences({ ...fields, accountAmount: 999 }, found)))
      .toEqual({ code: `INVALID_REQUEST`, fields: { accountAmount: { code: `mismatch` } } })
    expect(refusalOf(() => assertRuleReferences({ ...fields, accountAmount: 1000 }, found)))
      .toBeUndefined()
    expect(
      refusalOf(() =>
        assertRuleReferences({ ...fields, currency: `EUR`, accountAmount: 999 }, found)
      ),
    ).toBeUndefined()
  })
})

describe(`skipping a date`, () => {
  /** Every Monday from Tuesday 10 November 2026. */
  const mondays = {
    rrule: `FREQ=WEEKLY;INTERVAL=1;BYDAY=MO`,
    startDate: `2026-11-10`,
    endDate: null,
    count: null,
    skippedDates: [] as string[],
  }

  it(`adds an occurrence in order, and answers null for one skipped already`, () => {
    const once = skipDate({ ...mondays, skippedDates: [`2026-11-30`] }, `2026-11-16`)
    expect(once).toEqual([`2026-11-16`, `2026-11-30`])
    expect(skipDate({ ...mondays, skippedDates: once! }, `2026-11-16`)).toBeNull()
  })

  it(`refuses a date before the start, after the end, past the count or off the repeat`, () => {
    for (
      const [rule, date] of [
        [mondays, `2026-11-09`],
        [{ ...mondays, endDate: `2026-11-20` }, `2026-11-23`],
        [{ ...mondays, count: 2 }, `2026-11-30`],
        [mondays, `2026-11-17`],
      ] as const
    ) {
      expect(refusalOf(() => skipDate(rule, date)))
        .toEqual({ code: `INVALID_REQUEST`, fields: { date: { code: `invalid` } } })
    }
    expect(skipDate({ ...mondays, endDate: `2026-11-23` }, `2026-11-23`)).toEqual([`2026-11-23`])
    expect(skipDate({ ...mondays, count: 2 }, `2026-11-23`)).toEqual([`2026-11-23`])
  })

  it(`refuses a skip past ${RECURRING_SKIPPED_MAX} dates`, () => {
    const daily = { ...mondays, rrule: `FREQ=DAILY;INTERVAL=1`, startDate: `2020-01-01` }
    const full = Array.from(
      { length: RECURRING_SKIPPED_MAX },
      (_, day) => new Date(Date.UTC(2020, 0, 1 + day)).toISOString().slice(0, 10),
    )
    expect(refusalOf(() => skipDate({ ...daily, skippedDates: full }, `2026-01-01`))?.fields)
      .toEqual({ date: { code: `maxItems`, values: { rule: RECURRING_SKIPPED_MAX } } })
    expect(skipDate({ ...daily, skippedDates: full.slice(1) }, `2026-01-01`)).toHaveLength(
      RECURRING_SKIPPED_MAX,
    )
  })

  it(`counts the last day of a short month as a monthly occurrence on day -1`, () => {
    const lastDay = { ...mondays, rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1` }
    expect(isOccurrence(lastDay, `2027-02-28`)).toBe(true)
    expect(isOccurrence(lastDay, `2027-02-27`)).toBe(false)
  })
})
