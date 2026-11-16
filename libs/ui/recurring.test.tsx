/**
 * Repeating entries in a browser DOM (happy-dom): the household's upcoming dates and how Skip asks
 * first, "Repeat this" on an entry (days 29 to 31 become the last day), the monthly day choices,
 * an end date or a count but never both, the live sentence, and what a viewer sees.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import { RruleFreq } from "@spy4x/time/rrule"
import rruleWords from "@spy4x/time/rrule-words/en"
import { CategoryKind } from "@domain/categories"
import { RecurringPauseReason } from "@domain/recurring"
import { TransactionKind } from "@domain/transactions"
import app from "@i18n/app/en.ts"
import {
  LAST_DAY,
  MONTH_DAYS,
  NO_RECURRING_ERRORS,
  type RecurringEditorValue,
  recurringErrors,
  recurringRequest,
  recurringRows,
  RepeatEnd,
  repeatFromEntry,
  type RuleFacts,
} from "./recurring-parts.tsx"
import { RecurringScreen, type RecurringScreenProps } from "./recurring-screen.tsx"
import {
  RecurringEditorScreen,
  type RecurringEditorScreenProps,
} from "./recurring-editor-screen.tsx"
import { RECURRING_PATHS } from "./progressive.tsx"
import type { TransactionCategory } from "./transaction-parts.tsx"

/** The app's English with the repeat's words, as a screen without a provider reads it. */
const EN = createTranslator({ language: `en`, catalogs: [{ source: rruleWords }, { source: app }] })

const window = new Window({ url: "http://app.localhost/" })
const own = {
  document: globalThis.document,
  FormData: globalThis.FormData,
  location: globalThis.location,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
  // Preact draws into `document`; a form is read with the DOM's own FormData, a link is routed
  // only on the page's own origin, and a dialog locks the page's scroll after reading its style.
  Object.assign(globalThis, {
    document: window.document,
    FormData: window.FormData,
    location: window.location,
    getComputedStyle: window.getComputedStyle.bind(window),
  })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

let root: HTMLElement | null = null

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  document.body.innerHTML = ""
  root = null
})

async function mount(node: VNode): Promise<void> {
  root = document.createElement("div")
  document.body.append(root)
  await act(() => render(node, root!))
}

async function rerender(node: VNode): Promise<void> {
  await act(() => render(node, root!))
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element as unknown as T
}

const has = (selector: string) => document.querySelector(selector) !== null

/** An element's text without the marks that isolate a name's direction. */
function text(selector: string): string {
  return (find(selector).textContent ?? "").replace(/[⁨⁩]/g, "")
}

async function click(selector: string): Promise<void> {
  const event = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
  await act(() => {
    find(selector).dispatchEvent(event as unknown as Event)
  })
}

async function clickText(label: string, within: string): Promise<void> {
  const target = [...find(within).querySelectorAll("button, a")]
    .find((candidate) => candidate.textContent?.trim() === label)
  if (!target) throw new Error(`no button or link reads ${label} in ${within}`)
  await act(() => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
    )
  })
}

const TODAY = "2026-11-16"
const home = { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true }
const viewerOfHome = { ...home, canWrite: false }
const euros = { id: "a-eur", name: "Wallet", currency: "EUR", archived: false }
const housing: TransactionCategory = {
  id: "c-housing",
  name: "Housing",
  parentId: null,
  kind: CategoryKind.EXPENSE,
  archived: false,
}
const sport: TransactionCategory = { ...housing, id: "c-sport", name: "Sport" }

/** A rule that makes the rent on the 1st of every month. */
function rule(over: Partial<RuleFacts> & Pick<RuleFacts, "id">): RuleFacts {
  return {
    kind: TransactionKind.EXPENSE,
    amount: 120000,
    currency: "EUR",
    accountId: euros.id,
    categoryId: housing.id,
    memo: "Rent",
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    startDate: "2026-01-01",
    endDate: null,
    count: null,
    skippedDates: [],
    madeThrough: null,
    pausedReason: null,
    ...over,
  }
}

const rent = rule({ id: "r-rent" })
/** Every Monday; today is one, and the job already made today's entry. */
const gym = rule({
  id: "r-gym",
  amount: 3000,
  categoryId: sport.id,
  memo: "",
  rrule: "FREQ=WEEKLY;BYDAY=MO",
  startDate: "2026-11-02",
  madeThrough: TODAY,
  skippedDates: ["2026-11-30"],
})

function rows(rules: RuleFacts[]) {
  return recurringRows(rules, {
    words: EN,
    today: TODAY,
    accountName: () => euros.name,
    categoryLabel: (id) => (id === sport.id ? sport.name : housing.name),
  })
}

describe("recurringRows", () => {
  it("lists the next 30 days in date order, leaving out skipped days and days already made", () => {
    const { upcoming } = rows([rent, gym])
    expect(upcoming.map((row) => `${row.date} ${row.rule.id}`)).toEqual([
      "2026-11-23 r-gym",
      "2026-12-01 r-rent",
      "2026-12-07 r-gym",
      "2026-12-14 r-gym",
    ])
  })

  it("names a rule by its memo, else by its category, and says its repeat and next date", () => {
    const { rules } = rows([rent, gym])
    expect(rules[0]).toMatchObject({
      title: "Rent",
      amount: -120000,
      next: "2026-12-01",
      repeat: "Monthly on day 1",
    })
    expect(rules[1]).toMatchObject({ title: "Sport", next: "2026-11-23" })
  })

  it("gives a rule past the 30 days its next date but no upcoming row", () => {
    const yearly = rule({ id: "r-tax", rrule: "FREQ=YEARLY", startDate: "2026-03-01" })
    const { rules, upcoming } = rows([yearly])
    expect(upcoming).toEqual([])
    expect(rules[0].next).toBe("2027-03-01")
  })

  it("gives an ended rule no next date", () => {
    const ended = rule({ id: "r-old", endDate: "2026-06-30" })
    expect(rows([ended]).rules[0].next).toBe(null)
  })
})

const screen: RecurringScreenProps = {
  group: home,
  ...rows([rent, gym]),
  today: TODAY,
  loading: false,
  listError: null,
}

describe("RecurringScreen", () => {
  it("skips an upcoming date only after the person confirms", async () => {
    const skips: [string, string][] = []
    await mount(
      <RecurringScreen {...screen} onSkip={(id, date) => void skips.push([id, date])} />,
    )
    await click("[data-e2e=recurring-upcoming-r-rent-2026-12-01] [data-e2e=recurring-skip]")
    expect(skips).toEqual([])
    expect(text("[data-e2e=recurring-skip-dialog]")).toContain("Skip Rent on")

    await clickText("Cancel", "[data-e2e=recurring-skip-dialog]")
    expect(skips).toEqual([])

    await click("[data-e2e=recurring-upcoming-r-rent-2026-12-01] [data-e2e=recurring-skip]")
    await clickText("Skip this date", "[data-e2e=recurring-skip-dialog]")
    expect(skips).toEqual([["r-rent", "2026-12-01"]])
  })

  it("shows each rule's repeat and the reason it is paused", async () => {
    const paused = rows([{ ...rent, pausedReason: RecurringPauseReason.ACCOUNT_ARCHIVED }])
    await mount(<RecurringScreen {...screen} {...paused} />)
    expect(text("[data-e2e=recurring-r-rent] [data-e2e=recurring-repeat]"))
      .toBe("Monthly on day 1")
    expect(text("[data-e2e=recurring-r-rent] [data-e2e=recurring-paused]"))
      .toBe("Paused: the account is archived")
  })

  it("offers one action to start when the household has no rule", async () => {
    await mount(<RecurringScreen {...screen} rules={[]} upcoming={[]} />)
    expect(find("[data-e2e=recurring-new-empty]").getAttribute("href")).toBe(RECURRING_PATHS.new)
    expect(has("[data-e2e=recurring-upcoming]")).toBe(false)
  })

  it("gives a viewer both lists with no create, skip or link to the editor", async () => {
    await mount(<RecurringScreen {...screen} group={viewerOfHome} onSkip={() => {}} />)
    expect(has("[data-e2e=recurring-read-only]")).toBe(true)
    expect(has("[data-e2e=recurring-new]")).toBe(false)
    expect(has("[data-e2e=recurring-skip]")).toBe(false)
    expect(has("[data-e2e=recurring-list] a")).toBe(false)
    expect(has("[data-e2e=recurring-upcoming-r-gym-2026-11-23]")).toBe(true)
  })
})

const entry = {
  kind: TransactionKind.EXPENSE,
  amount: -120000,
  currency: "EUR",
  accountId: euros.id,
  categoryId: housing.id,
  memo: "Rent",
}

describe("repeatFromEntry", () => {
  it("repeats an entry monthly on its day, from one month after it", () => {
    expect(repeatFromEntry({ ...entry, date: "2026-11-15" })).toMatchObject({
      amount: 120000,
      freq: RruleFreq.Monthly,
      interval: 1,
      monthDay: 15,
      startDate: "2026-12-15",
      end: RepeatEnd.NEVER,
      accountAmount: null,
    })
  })

  it("turns day 29, 30 or 31 into the last day of the month, from the next month's last day", () => {
    for (const date of ["2026-01-29", "2026-01-30", "2026-01-31"]) {
      expect(repeatFromEntry({ ...entry, date })).toMatchObject({
        monthDay: LAST_DAY,
        startDate: "2026-02-28",
      })
    }
    expect(repeatFromEntry({ ...entry, date: "2026-12-31" }).startDate).toBe("2027-01-31")
  })
})

/** A complete monthly rule as the editor holds it. */
const value: RecurringEditorValue = repeatFromEntry({ ...entry, date: "2026-11-15" })

describe("recurringRequest", () => {
  it("sends the end date alone when the rule ends on a date", () => {
    const request = recurringRequest({
      ...value,
      end: RepeatEnd.ON_DATE,
      endDate: "2027-06-15",
      count: 12,
    })
    expect(request).toMatchObject({
      endDate: "2027-06-15",
      rrule: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15",
    })
    expect("count" in request).toBe(false)
  })

  it("sends the count alone when the rule ends after a number of entries", () => {
    const request = recurringRequest({
      ...value,
      end: RepeatEnd.AFTER_COUNT,
      endDate: "2027-06-15",
      count: 12,
    })
    expect(request.count).toBe(12)
    expect("endDate" in request).toBe(false)
  })

  it("sends neither when the rule never ends", () => {
    const request = recurringRequest({ ...value, endDate: "2027-06-15", count: 12 })
    expect("endDate" in request || "count" in request).toBe(false)
  })
})

describe("recurringErrors", () => {
  it("finds nothing wrong with a complete rule", () => {
    expect(recurringErrors(value)).toEqual(NO_RECURRING_ERRORS)
  })

  it("asks for an end date that is not before the start, and a count of at least one", () => {
    expect(recurringErrors({ ...value, end: RepeatEnd.ON_DATE, endDate: "" }).endDate)
      .toBe("RecurringMessages.endDate")
    expect(recurringErrors({ ...value, end: RepeatEnd.ON_DATE, endDate: "2026-12-01" }).endDate)
      .toBe("RecurringMessages.endBeforeStart")
    expect(recurringErrors({ ...value, end: RepeatEnd.AFTER_COUNT, count: 0 }).count)
      .toMatchObject({ key: "RecurringMessages.count" })
  })

  it("asks a weekly rule for a day and refuses a yearly rule from 29 February", () => {
    expect(recurringErrors({ ...value, freq: RruleFreq.Weekly, weekdays: [] }).weekdays)
      .toBe("RecurringMessages.weekdays")
    expect(
      recurringErrors({ ...value, freq: RruleFreq.Yearly, startDate: "2028-02-29" }).startDate,
    ).toBe("RecurringMessages.leapDay")
  })
})

const editor: RecurringEditorScreenProps = {
  group: home,
  loading: false,
  notFound: false,
  rule: null,
  value,
  errors: NO_RECURRING_ERRORS,
  accounts: [euros],
  categories: [housing, sport],
  words: EN,
  saving: false,
  dirty: false,
}

describe("RecurringEditorScreen", () => {
  it("offers days 1 to 28 and the last day of the month, never 29 to 31", async () => {
    expect(MONTH_DAYS).toHaveLength(29)
    await mount(<RecurringEditorScreen {...editor} />)
    const options = [...find("[data-e2e=recurring-month-day]").querySelectorAll("option")]
    expect(options.map((option) => option.value)).toEqual(MONTH_DAYS.map(String))
    expect(options.at(-1)!.textContent).toBe("Last day of the month")
  })

  it("shows the end date field or the count field, by how the rule ends", async () => {
    await mount(<RecurringEditorScreen {...editor} />)
    expect(has("[data-e2e=recurring-end-date]") || has("[data-e2e=recurring-count]")).toBe(false)
    await rerender(
      <RecurringEditorScreen {...editor} value={{ ...value, end: RepeatEnd.ON_DATE }} />,
    )
    expect(has("[data-e2e=recurring-end-date]")).toBe(true)
    expect(has("[data-e2e=recurring-count]")).toBe(false)
    await rerender(
      <RecurringEditorScreen {...editor} value={{ ...value, end: RepeatEnd.AFTER_COUNT }} />,
    )
    expect(has("[data-e2e=recurring-end-date]")).toBe(false)
    expect(has("[data-e2e=recurring-count]")).toBe(true)
  })

  it("says the repeat in words under the fields as they change", async () => {
    await mount(<RecurringEditorScreen {...editor} />)
    expect(text("[data-e2e=recurring-sentence] p")).toBe("Monthly on day 15")
    await rerender(
      <RecurringEditorScreen
        {...editor}
        value={{ ...value, monthDay: LAST_DAY, end: RepeatEnd.AFTER_COUNT, count: 12 }}
      />,
    )
    expect(text("[data-e2e=recurring-sentence] p")).toBe("Monthly on the last day, 12 times")
  })

  it("moves focus to the first field a refused save newly names", async () => {
    await mount(<RecurringEditorScreen {...editor} />)
    await rerender(
      <RecurringEditorScreen
        {...editor}
        errors={{ ...NO_RECURRING_ERRORS, category: `Pick one`, startDate: `Pick one` }}
      />,
    )
    expect(document.activeElement?.id).toBe(`recurring-category`)
    await rerender(
      <RecurringEditorScreen
        {...editor}
        errors={{ ...NO_RECURRING_ERRORS, amount: `Enter one`, category: `Pick one` }}
      />,
    )
    expect(document.activeElement?.id).toBe(`recurring-amount`)
  })

  it("lets a writer delete a saved rule from the page's menu", async () => {
    const deleted: true[] = []
    await mount(
      <RecurringEditorScreen
        {...editor}
        rule={rows([rent]).rules[0]}
        onDelete={() => void deleted.push(true)}
      />,
    )
    expect(has("[data-e2e=recurring-save]")).toBe(false)
    await click("[data-e2e=recurring-editor-menu]")
    await click("[data-e2e=recurring-delete]")
    expect(deleted).toEqual([true])
  })

  it("shows a viewer the rule as text, with no form and no menu", async () => {
    await mount(
      <RecurringEditorScreen
        {...editor}
        group={viewerOfHome}
        rule={rows([rent]).rules[0]}
        onDelete={() => {}}
      />,
    )
    expect(text("[data-e2e=recurring-facts]")).toContain("Monthly on day 1")
    expect(has("form")).toBe(false)
    expect(has("[data-e2e=recurring-editor-menu]")).toBe(false)
  })
})
