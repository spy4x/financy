/**
 * `/balance` and `/month` in the Telegram chat (spy4x/financy#346): the figures of the person's
 * selected household, from the very reads the overview's cards use, so the chat and the app agree.
 *
 * A read changes nothing: it never picks a household, and it leaves a running `/expense` talk and
 * its draft alone. Every query carries the person's `actor`, so the buses decide what they may
 * read. Nothing is summed or converted here. A figure with no honest number gets a sentence.
 *
 * @module
 */

import type { QueryBus } from "@spy4x/platform/cqrs"
import type { TelegramContext } from "@spy4x/integrations/telegram"
import { negotiateLanguage } from "@spy4x/platform/universal/i18n"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import { endOfMonth, parseIsoDate, startOfMonth } from "@spy4x/time/date"
import { isoDateInTz } from "@spy4x/time/tz"
import {
  ACCOUNT_KINDS,
  AccountError,
  AccountWidgetQuery,
  type AccountWidgetResult,
} from "@domain/accounts"
import { CategoryError, CategoryListQuery } from "@domain/categories"
import { GroupError, GroupGetQuery, GroupSelectedQuery, groupTimeZone } from "@domain/groups"
import { type Language, LANGUAGES } from "@domain/identity"
import { amountDecimals } from "@domain/money"
import {
  type CategoryWidgetResult,
  categoryWidgetResult,
  type Ledger,
  TransactionError,
  TransactionLedgerQuery,
} from "@domain/transactions"
import { isolate } from "@server/mail/mail.ts"
import { translatorFor } from "@server/telegram/words.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import { knownLocale, PICK_MAX } from "./entries.ts"
import type { TelegramAccount, TelegramProduct } from "./extension.ts"

/** What the read commands dispatch through, and the clock that says which month it is. */
export interface ReadDeps {
  queryBus: Pick<QueryBus, `execute`>
  /** The instant "this month" is worked out from. Defaults to the server's clock. */
  now?: () => Date
}

/** The longest message Telegram accepts, in UTF-16 code units. */
export const MESSAGE_MAX = 4096

/** The most currencies one left-out sentence names before "N more". */
export const LEFT_OUT_NAMED = 30

/** Room kept for the closing "and N more" line, longer than that line in any language. */
const MORE_LINE_ROOM = 120

/** The formatters of one reply: its language, and the person's region format for figures. */
function wordsFor(language: Language, locale: string) {
  const t = translatorFor(language)
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: `medium`, timeZone: `UTC` })
  const months = new Intl.DateTimeFormat(locale, {
    month: `long`,
    year: `numeric`,
    timeZone: `UTC`,
  })
  const list = new Intl.ListFormat(language, { type: `conjunction` })
  return {
    t,
    money: (amount: number, currency: string) =>
      isolate(formatMoney(amount, currency, locale, { decimals: amountDecimals(currency) })),
    date: (iso: string) => isolate(dates.format(parseIsoDate(iso))),
    month: (iso: string) => isolate(months.format(parseIsoDate(iso))),
    figure: (label: string, value: string) => t.t(`TelegramBot.figure`, { label, value }),
    /** Names the first {@link LEFT_OUT_NAMED} codes and counts the rest. */
    currencies: (codes: readonly string[]) => {
      const named = codes.slice(0, LEFT_OUT_NAMED).map(isolate)
      const rest = codes.length - named.length
      return list.format(
        rest > 0 ? [...named, t.t(`TelegramBot.moreCurrencies`, { count: rest })] : named,
      )
    },
  }
}
type Words = ReturnType<typeof wordsFor>

/** The household total's lines, as the overview's card words them. */
function totalLines(total: AccountWidgetResult[`total`], words: Words): string[] {
  const { t, money, date, figure, currencies } = words
  const lines: string[] = []
  if (total.amount !== null) {
    const amount = money(total.amount, total.currency)
    const about = total.rateDate !== null || total.coinPriceDate !== null
    lines.push(
      figure(t.t(`AccountsTotal.title`), about ? t.t(`AccountsTotal.about`, { amount }) : amount),
    )
    if (total.rateDate !== null) {
      lines.push(t.t(`AccountsTotal.rates`, { date: date(total.rateDate) }))
    }
    if (total.coinPriceDate !== null) {
      lines.push(t.t(`AccountsTotal.coins`, { date: date(total.coinPriceDate) }))
    }
  } else if (!total.tooLarge) {
    lines.push(t.t(`TelegramBot.noTotal`))
  }
  if (total.tooLarge) lines.push(t.t(`AccountsTotal.tooLarge`))
  if (total.leftOut.length > 0) {
    lines.push(t.t(`AccountsTotal.leftOut`, {
      count: total.leftOut.reduce((sum, item) => sum + item.accounts, 0),
      currencies: currencies(total.leftOut.map((item) => item.currency)),
    }))
  }
  return lines
}

/**
 * `lines` that fit in `room` code units, at most {@link PICK_MAX} of them, closed by `more` with
 * how many did not fit.
 */
function linesWithin(lines: string[], room: number, more: (count: number) => string): string[] {
  const shown: string[] = []
  let left = room - MORE_LINE_ROOM
  for (const line of lines.slice(0, PICK_MAX)) {
    left -= line.length + 1
    if (left < 0) break
    shown.push(line)
  }
  const rest = lines.length - shown.length
  return rest > 0 ? [...shown, more(rest)] : shown
}

/** The `/balance` reply: the total, then each open account in the overview's order. */
function balanceText(name: string, result: AccountWidgetResult, words: Words): string {
  const { t, money, figure } = words
  if (result.accounts.length === 0) return t.t(`TelegramBot.noAccount`)
  const live = ACCOUNT_KINDS.flatMap((kind) =>
    result.accounts.filter((account) => !account.archived && account.kind === kind)
  )
  const archived = result.accounts.length - live.length
  const head = [
    isolate(name),
    ...totalLines(result.total, words),
    ...archived > 0 ? [t.t(`AccountWidgets.archived`, { count: archived })] : [],
  ].join(`\n`)
  const rows = linesWithin(
    live.map((account) => figure(isolate(account.name), money(account.balance, account.currency))),
    MESSAGE_MAX - head.length - 2,
    (count) => t.t(`TelegramBot.moreAccounts`, { count }),
  )
  return rows.length > 0 ? `${head}\n\n${rows.join(`\n`)}` : head
}

/** The `/month` reply: income, spending, net and the categories the overview ranks first. */
function monthText(
  name: string,
  ledger: Ledger,
  ranked: CategoryWidgetResult,
  words: Words,
): string {
  const { t, money, date, month, figure, currencies } = words
  const shown = (amount: number, rateDate: string | null) => {
    const value = money(amount, ledger.currency)
    return rateDate === null ? value : t.t(`MoneyWidgets.about`, { amount: value })
  }
  const rates = (rateDate: string | null) =>
    rateDate === null ? [] : [t.t(`MoneyWidgets.rates`, { date: date(rateDate) })]
  const leftOut = (key: string, codes: readonly string[]) =>
    codes.length === 0 ? [] : [t.t(key, { count: codes.length, currencies: currencies(codes) })]

  /** A figure made only of entries with no rate is no figure: the sentence says why. */
  const side = (
    title: string,
    amount: number | null,
    rateDate: string | null,
    codes: readonly string[],
  ) =>
    amount === null || (amount === 0 && codes.length > 0)
      ? []
      : [figure(title, shown(amount, rateDate)), ...rates(rateDate)]

  const nothingCounted = ledger.leftOut.length > 0 && ledger.income === 0 && ledger.spending === 0
  const figures = [
    ...side(
      t.t(`MoneyWidgets.incomeTitle`),
      ledger.income,
      ledger.incomeRateDate,
      ledger.incomeLeftOut,
    ),
    ...ledger.income === null ? [t.t(`MoneyWidgets.incomeTooLarge`)] : [],
    ...leftOut(`MoneyWidgets.incomeLeftOut`, ledger.incomeLeftOut),
    ...side(
      t.t(`MoneyWidgets.spendingTitle`),
      ledger.spending,
      ledger.spendingRateDate,
      ledger.spendingLeftOut,
    ),
    ...ledger.spending === null ? [t.t(`MoneyWidgets.spendingTooLarge`)] : [],
    ...leftOut(`MoneyWidgets.spendingLeftOut`, ledger.spendingLeftOut),
    ...ledger.net === null
      ? [t.t(`MoneyWidgets.netTooLarge`)]
      : nothingCounted
      ? leftOut(`MoneyWidgets.netLeftOut`, ledger.leftOut)
      : [figure(t.t(`MoneyWidgets.netTitle`), shown(ledger.net, ledger.rateDate))],
  ]
  const rows = ranked.tooLarge ? [] : ranked.top.map((row) =>
    figure(
      isolate(row.name),
      row.converted
        ? t.t(`MoneyWidgets.about`, { amount: money(row.spending, ranked.currency) })
        : money(row.spending, ranked.currency),
    )
  )
  const categories = rows.length === 0 ? [] : [
    t.t(`MoneyWidgets.categoriesTitle`),
    ...rows,
    ...ranked.more > 0 ? [t.t(`MoneyWidgets.categoriesMore`, { count: ranked.more })] : [],
  ]
  // The sum of the rows alone can pass what a number holds while each figure above still fits.
  const unranked = ranked.tooLarge && !ledger.tooLarge ? [t.t(`MoneyWidgets.spendingTooLarge`)] : []
  return [
    `${isolate(name)} · ${month(ledger.from)}`,
    figures.join(`\n`),
    [...categories, ...unranked].join(`\n`),
  ].filter((block) => block !== ``).join(`\n\n`)
}

/** Whether the buses said the person is not in the household they asked about. */
function isNotMember(error: unknown): boolean {
  const known = error instanceof AccountError || error instanceof TransactionError ||
    error instanceof CategoryError || error instanceof GroupError
  return known && error.code === `GROUP_NOT_FOUND`
}

/** `/balance` and `/month`. */
export function createReadCommands(
  { queryBus, now = () => new Date() }: ReadDeps,
): Pick<TelegramProduct, `commands`> {
  /** What one command reads of the selected household, turned into its reply. */
  type Read = (
    group: { id: string; name: string; timeZone: string },
    account: TelegramAccount,
    words: Words,
  ) => Promise<string>

  /** Answers from the selected household; a person no longer in it gets one line, no figures. */
  const answer = (read: Read) => async (ctx: TelegramContext, account: TelegramAccount) => {
    const { actor } = account
    const language = negotiateLanguage(ctx.from?.language_code, LANGUAGES, `en`)
    const say = (key: string) => translatorFor(language).t(key)
    let reply: string
    try {
      const { groupId } = await queryBus.execute(new GroupSelectedQuery({ actor }))
      if (!groupId) return void await ctx.reply(say(`TelegramBot.noHousehold`))
      const [{ group }, { value: preferences }] = await Promise.all([
        queryBus.execute(new GroupGetQuery({ actor, groupId })),
        queryBus.execute(new PreferencesGetQuery({ actor })),
      ])
      const locale = knownLocale(preferences.locale ?? ctx.from?.language_code)
      reply = await read(group, account, wordsFor(language, locale))
    } catch (error) {
      if (!isNotMember(error)) throw error
      reply = say(`TelegramBot.notMember`)
    }
    await ctx.reply(reply)
  }

  const balance: Read = async (group, { actor }, words) =>
    balanceText(
      group.name,
      await queryBus.execute(new AccountWidgetQuery({ actor, groupId: group.id })),
      words,
    )

  const month: Read = async (group, { actor }, words) => {
    const today = isoDateInTz(now(), groupTimeZone(group))
    const range = { from: startOfMonth(today), to: endOfMonth(today) }
    const [{ ledger }, { categories }] = await Promise.all([
      queryBus.execute(new TransactionLedgerQuery({ actor, groupId: group.id, ...range })),
      queryBus.execute(new CategoryListQuery({ actor, groupId: group.id })),
    ])
    return monthText(group.name, ledger, categoryWidgetResult(ledger, categories), words)
  }

  return {
    commands: [
      { name: `balance`, description: `Show balances and the total`, handler: answer(balance) },
      { name: `month`, description: `Show this month's money`, handler: answer(month) },
    ],
  }
}
