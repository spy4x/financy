/**
 * `/transfer` in the Telegram chat (spy4x/financy#347): pick the two accounts, type the amount that
 * left and, across currencies, the amount that arrived or the day's rate, then Save.
 *
 * The talk's state is one draft per person in Valkey, under the same key as an entry's, so a person
 * has one talk at a time. Its id is the new transfer's id and idempotency key, so a second Save
 * stores nothing twice. Every button names the draft by the last 8 characters of that id and is
 * valid at one step only. Every id a button carries is read again through the query bus as the
 * person, and the write goes through the command bus with the person's `actor`: the buses decide
 * who may move money, the bot adds no role check.
 *
 * @module
 */

import { type } from "arktype"
import type { TelegramContext, TelegramInlineButton } from "@spy4x/integrations/telegram"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import { negotiateLanguage } from "@spy4x/platform/universal/i18n"
import { UUID_PATTERN, uuidV7 } from "@spy4x/platform/universal/uuid"
import { type Account, AccountGetQuery, AccountListQuery } from "@domain/accounts"
import { GroupListQuery, GroupSelectCommand, GroupSelectedQuery } from "@domain/groups"
import { type Language, LANGUAGES } from "@domain/identity"
import { amountDecimals } from "@domain/money"
import {
  type Transfer,
  TransferCreateCommand,
  TransferError,
  TransferGetQuery,
} from "@domain/transfers"
import { isolate } from "@server/mail/mail.ts"
import { translatorFor } from "@server/telegram/words.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import {
  editPressed,
  ENTRY_DRAFT_SECONDS,
  type EntryDeps,
  entryText,
  knownLocale,
  PICK_MAX,
  readAmount,
  Refused,
  refusing,
  talkKey,
  told,
} from "./entries.ts"
import type { TelegramAccount, TelegramProduct } from "./extension.ts"

/** The `callback_data` prefix of every transfer button. */
export const TRANSFER_CALLBACK = `tr`

/** The conversation that waits for a typed amount. */
export const TRANSFER_CONVERSATION = `transfer`

/** One talk's state, as stored. `talk` keeps an entry's draft from ever reading as this one. */
const draftSchema = type({
  talk: `'transfer'`,
  id: UUID_PATTERN,
  step: `'household' | 'from' | 'to' | 'sent' | 'received' | 'summary'`,
  groupId: type(UUID_PATTERN).or(`null`),
  /** The region format amounts are read in; empty until the household is known. */
  locale: `string <= 64`,
  fromAccountId: type(UUID_PATTERN).or(`null`),
  toAccountId: type(UUID_PATTERN).or(`null`),
  sentAmount: `number.integer > 0 | null`,
  /** What the person typed; `null` in one currency and with the day's rate. */
  receivedAmount: `number.integer > 0 | null`,
  useRate: `boolean`,
})
type Draft = typeof draftSchema.infer
type Step = Draft[`step`]

/** How many of the household, from, to and sent fields each step has filled, in that order. */
const FILLED: Record<Step, number> = {
  household: 0,
  from: 1,
  to: 2,
  sent: 3,
  received: 4,
  summary: 4,
}

/** Whether the draft holds exactly what its step has asked for so far. */
function coherent(draft: Draft): boolean {
  const asked = [draft.groupId, draft.fromAccountId, draft.toAccountId, draft.sentAmount]
  if (!asked.every((value, index) => (value !== null) === (index < FILLED[draft.step]))) {
    return false
  }
  if (draft.step === `summary`) return !(draft.useRate && draft.receivedAmount !== null)
  return !draft.useRate && draft.receivedAmount === null
}

/** The step each button belongs to; Cancel, `null`, works at every step. */
const ACTIONS = {
  g: `household`,
  f: `from`,
  t: `to`,
  r: `received`,
  s: `summary`,
  x: null,
} as const
type Action = keyof typeof ACTIONS
const PICKS: readonly Action[] = [`g`, `f`, `t`]
const BUTTON = new RegExp(`^([${Object.keys(ACTIONS).join(``)}]):([0-9a-f]{8})(?::(.+))?$`)
const isUuid = type(UUID_PATTERN).allows

/** The transfer's words in `language`: an entry's, with the lines that speak of entries replaced. */
export function transferText(language: Language) {
  const t = translatorFor(language)
  return {
    ...entryText(language),
    viewer: t.t(`TelegramBot.transferViewer`),
    unavailable: t.t(`TelegramBot.transferUnavailable`),
    stale: t.t(`TelegramBot.transferStale`),
    needsTwo: t.t(`TelegramBot.transferNeedsTwo`),
    pickFrom: t.t(`TelegramBot.transferPickFrom`),
    pickTo: t.t(`TelegramBot.transferPickTo`),
    askSent: (currency: string, account: string) =>
      t.t(`TelegramBot.transferAskSent`, { currency, account: isolate(account) }),
    askReceived: (currency: string, account: string) =>
      t.t(`TelegramBot.transferAskReceived`, { currency, account: isolate(account) }),
    useRate: t.t(`TelegramBot.transferUseRate`),
    transferSummary: (values: { sent: string; from: string; received: string; to: string }) =>
      t.t(`TelegramBot.transferSummary`, values),
    summaryRate: (values: { sent: string; from: string; to: string }) =>
      t.t(`TelegramBot.transferSummaryRate`, values),
    stored: (values: { sent: string; from: string; received: string; to: string }) =>
      t.t(`TelegramBot.transferSaved`, values),
    converted: t.t(`TelegramBot.transferConverted`),
    noRate: t.t(`TelegramBot.transferNoRate`),
  }
}

/** The words in the language Telegram reports for the person, else English. */
const textOf = (ctx: TelegramContext) =>
  transferText(negotiateLanguage(ctx.from?.language_code, LANGUAGES, `en`))

/** `/transfer`, its buttons and the conversation that reads the typed amounts. */
export function createTransferCommands(
  { queryBus, commandBus, store }: EntryDeps,
): TelegramProduct {
  async function load(ctx: TelegramContext, account: TelegramAccount): Promise<Draft | null> {
    const raw = await store.get(talkKey(ctx, account))
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const draft = draftSchema(parsed)
    return draft instanceof type.errors || !coherent(draft) ? null : draft
  }

  const keep = (ctx: TelegramContext, account: TelegramAccount, draft: Draft) =>
    store.set(talkKey(ctx, account), JSON.stringify(draft), ENTRY_DRAFT_SECONDS)

  const drop = (ctx: TelegramContext, account: TelegramAccount) => store.del(talkKey(ctx, account))

  const bus = <T>(ctx: TelegramContext, call: () => Promise<T>) => refusing(ctx, textOf(ctx), call)

  const button = (draft: Draft, text: string, action: Action, id?: string) => ({
    text,
    callback_data: `${TRANSFER_CALLBACK}:${action}:${draft.id.slice(-8)}${id ? `:${id}` : ``}`,
  })
  const cancelRow = (ctx: TelegramContext, draft: Draft) => [
    button(draft, textOf(ctx).cancel, `x`),
  ]

  /** One button per open account, at most {@link PICK_MAX}, and Cancel. */
  const accountRows = (
    ctx: TelegramContext,
    draft: Draft,
    action: Action,
    accounts: readonly Account[],
  ): TelegramInlineButton[][] => [
    ...accounts.slice(0, PICK_MAX).map((one) => [
      button(draft, `${one.name} · ${one.currency}`, action, one.id),
    ]),
    cancelRow(ctx, draft),
  ]

  /** The household's open accounts, without `except`. */
  async function openAccounts(
    ctx: TelegramContext,
    { actor }: TelegramAccount,
    groupId: string,
    except?: string,
  ) {
    const { accounts } = await bus(
      ctx,
      () => queryBus.execute(new AccountListQuery({ actor, groupId })),
    )
    return accounts.filter((one) => one.archivedAt === null && one.id !== except)
  }

  /** The open account `id` of the household, read as the person; anything else stops the step. */
  async function openAccount(
    ctx: TelegramContext,
    { actor }: TelegramAccount,
    groupId: string,
    id: string,
  ): Promise<Account> {
    const { account: found } = await bus(
      ctx,
      () => queryBus.execute(new AccountGetQuery({ actor, groupId, id })),
    )
    if (found.archivedAt !== null) {
      await ctx.reply(textOf(ctx).unavailable)
      throw new Refused()
    }
    return found
  }

  /** Both accounts of a draft that has picked them, read again. */
  async function accountsOf(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const from = await openAccount(ctx, account, draft.groupId!, draft.fromAccountId!)
    const to = await openAccount(ctx, account, draft.groupId!, draft.toAccountId!)
    return { from, to }
  }

  /** An amount in the draft's region format, kept in one piece inside a sentence. */
  const money = (draft: Draft, amount: number, currency: string) =>
    isolate(formatMoney(amount, currency, draft.locale, { decimals: amountDecimals(currency) }))

  /** The question of the step the draft is at, for `amountStep` and the steps that lead to it. */
  function question(ctx: TelegramContext, draft: Draft, from: Account, to: Account) {
    const words = textOf(ctx)
    return draft.step === `sent`
      ? words.askSent(from.currency, from.name)
      : words.askReceived(to.currency, to.name)
  }

  /** Asks for the amount of the draft's step, and waits for the answer. */
  async function ask(
    ctx: TelegramContext,
    account: TelegramAccount,
    draft: Draft,
    { from, to }: { from: Account; to: Account },
    { why = ``, offerRate = false } = {},
  ) {
    await keep(ctx, account, draft)
    const asked = question(ctx, draft, from, to)
    await ctx.reply(why ? `${why} ${asked}` : asked, {
      reply_markup: {
        inline_keyboard: [
          ...(offerRate ? [[button(draft, textOf(ctx).useRate, `r`)]] : []),
          cancelRow(ctx, draft),
        ],
      },
    })
    await ctx.conversation.start(TRANSFER_CONVERSATION)
  }

  /** The draft's summary line and its buttons. */
  function summary(ctx: TelegramContext, draft: Draft, from: Account, to: Account) {
    const words = textOf(ctx)
    const names = { from: isolate(from.name), to: isolate(to.name) }
    const sent = money(draft, draft.sentAmount!, from.currency)
    const text = draft.useRate ? words.summaryRate({ sent, ...names }) : words.transferSummary({
      sent,
      received: money(draft, draft.receivedAmount ?? draft.sentAmount!, to.currency),
      ...names,
    })
    return { text, rows: [[button(draft, words.save, `s`)], cancelRow(ctx, draft)] }
  }

  /** Goes on once the household is known: two open accounts, then the first pick. */
  async function proceed(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const words = textOf(ctx)
    const { value: preferences } = await bus(
      ctx,
      () => queryBus.execute(new PreferencesGetQuery({ actor: account.actor })),
    )
    const open = await openAccounts(ctx, account, draft.groupId!)
    if (open.length < 2) {
      await drop(ctx, account)
      return void await ctx.reply(words.needsTwo)
    }
    const next: Draft = {
      ...draft,
      step: `from`,
      locale: knownLocale(preferences.locale ?? ctx.from?.language_code),
    }
    await keep(ctx, account, next)
    await ctx.reply(words.pickFrom, {
      reply_markup: { inline_keyboard: accountRows(ctx, next, `f`, open) },
    })
  }

  /** `/transfer`; anything typed after it is ignored. */
  const start = (ctx: TelegramContext, account: TelegramAccount) =>
    told(async () => {
      await ctx.conversation.end()
      await drop(ctx, account)
      const { actor } = account
      const draft: Draft = {
        talk: `transfer`,
        id: uuidV7(),
        step: `household`,
        groupId: null,
        locale: ``,
        fromAccountId: null,
        toAccountId: null,
        sentAmount: null,
        receivedAmount: null,
        useRate: false,
      }
      const selected = await bus(ctx, () => queryBus.execute(new GroupSelectedQuery({ actor })))
      if (!selected.groupId) return void await ctx.reply(textOf(ctx).noHousehold)
      if (selected.version === 0) {
        const { groups } = await bus(
          ctx,
          () => queryBus.execute(new GroupListQuery({ actor, page: { limit: PICK_MAX } })),
        )
        if (groups.length > 1) {
          await keep(ctx, account, draft)
          return void await ctx.reply(textOf(ctx).pickHousehold, {
            reply_markup: {
              inline_keyboard: groups.map((group) => [button(draft, group.name, `g`, group.id)]),
            },
          })
        }
      }
      await proceed(ctx, account, { ...draft, groupId: selected.groupId })
    })

  /** The typed amount of the step the draft is at. */
  async function amountStep(ctx: TelegramContext, account: TelegramAccount) {
    if (ctx.text === undefined) return
    const words = textOf(ctx)
    const draft = await load(ctx, account)
    if (draft?.step !== `sent` && draft?.step !== `received`) {
      await ctx.reply(words.stale)
      return { done: true } as const
    }
    let result: { done: true } | undefined
    await told(async () => {
      const accounts = await accountsOf(ctx, account, draft)
      const { from, to } = accounts
      const currency = draft.step === `sent` ? from.currency : to.currency
      const read = readAmount(ctx.text!.trim(), currency, draft.locale, words)
      if (`refusal` in read) {
        const offerRate = draft.step === `received`
        return await ask(ctx, account, draft, accounts, { why: read.refusal, offerRate })
      }
      if (draft.step === `sent` && from.currency !== to.currency) {
        const next: Draft = { ...draft, step: `received`, sentAmount: read.amount }
        return await ask(ctx, account, next, accounts, { offerRate: true })
      }
      const next: Draft = draft.step === `sent`
        ? { ...draft, step: `summary`, sentAmount: read.amount }
        : { ...draft, step: `summary`, receivedAmount: read.amount }
      await keep(ctx, account, next)
      const shown = summary(ctx, next, from, to)
      await ctx.reply(shown.text, { reply_markup: { inline_keyboard: shown.rows } })
      result = { done: true }
    })
    return result
  }

  /**
   * Stores the transfer: no date, so the server takes today in the household's zone, and the
   * draft's id, so a second Save of the same talk answers with the transfer the first one stored.
   */
  async function save(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const words = textOf(ctx)
    const accounts = await accountsOf(ctx, account, draft)
    const { from, to } = accounts
    const stated = draft.receivedAmount !== null || draft.useRate
    if (stated !== (from.currency !== to.currency)) return await editPressed(ctx, words.stale)
    const { actor } = account
    const groupId = draft.groupId!
    let stored: Transfer
    try {
      const result = await bus(ctx, () =>
        commandBus.execute(
          new TransferCreateCommand({
            actor,
            groupId,
            id: draft.id,
            idempotencyKey: draft.id,
            fromAccountId: from.id,
            toAccountId: to.id,
            sentAmount: draft.sentAmount!,
            ...(draft.receivedAmount !== null && { receivedAmount: draft.receivedAmount }),
          }),
        ))
      stored = result.transfer
    } catch (error) {
      if (!(error instanceof TransferError)) throw error
      if (
        error.code === `NO_RATE` ||
        (error.code === `INVALID_REQUEST` && error.fields?.receivedAmount)
      ) {
        await editPressed(ctx, summary(ctx, draft, from, to).text)
        const next: Draft = { ...draft, step: `received`, receivedAmount: null, useRate: false }
        return await ask(ctx, account, next, accounts, { why: words.noRate })
      }
      if (error.code === `INVALID_REQUEST` && error.fields?.sentAmount?.code === `tooLarge`) {
        return void await ctx.reply(words.tooLarge)
      }
      if (error.code !== `ID_ALREADY_EXISTS`) throw error
      // The same id answered with a different transfer: only an earlier Save of this talk made it.
      const found = await bus(
        ctx,
        () => queryBus.execute(new TransferGetQuery({ actor, groupId, id: draft.id })),
      )
      stored = found.transfer
    }
    await drop(ctx, account)
    await ctx.conversation.end()
    const text = words.stored({
      sent: money(draft, stored.sentAmount, from.currency),
      from: isolate(from.name),
      received: money(draft, stored.receivedAmount, to.currency),
      to: isolate(to.name),
    })
    await editPressed(ctx, stored.converted ? `${text}\n${words.converted}` : text)
  }

  /** A press of any transfer button. */
  const press = (ctx: TelegramContext, account: TelegramAccount) =>
    told(async () => {
      const words = textOf(ctx)
      const match = BUTTON.exec(ctx.args)
      const draft = await load(ctx, account)
      const action = match?.[1] as Action | undefined
      const id = match?.[3]
      if (
        !match || !action || !draft || draft.id.slice(-8) !== match[2] ||
        PICKS.includes(action) !== (id !== undefined) || (id !== undefined && !isUuid(id)) ||
        (ACTIONS[action] !== null && ACTIONS[action] !== draft.step)
      ) {
        return await editPressed(ctx, words.stale)
      }
      if (action === `x`) {
        await drop(ctx, account)
        await ctx.conversation.end()
        return await editPressed(ctx, words.cancelled)
      }
      if (action === `g`) {
        const { actor } = account
        await bus(ctx, () => commandBus.execute(new GroupSelectCommand({ actor, groupId: id! })))
        await editPressed(ctx, words.pickHousehold)
        return await proceed(ctx, account, { ...draft, groupId: id! })
      }
      const groupId = draft.groupId!
      if (action === `f`) {
        const from = await openAccount(ctx, account, groupId, id!)
        const others = await openAccounts(ctx, account, groupId, from.id)
        if (others.length === 0) {
          await drop(ctx, account)
          return await editPressed(ctx, words.needsTwo)
        }
        const next: Draft = { ...draft, step: `to`, fromAccountId: from.id }
        await keep(ctx, account, next)
        return await editPressed(ctx, words.pickTo, accountRows(ctx, next, `t`, others))
      }
      if (action === `t`) {
        if (id === draft.fromAccountId) return void await ctx.reply(words.unavailable)
        const to = await openAccount(ctx, account, groupId, id!)
        const from = await openAccount(ctx, account, groupId, draft.fromAccountId!)
        await editPressed(ctx, words.pickTo)
        const next: Draft = { ...draft, step: `sent`, toAccountId: to.id }
        return await ask(ctx, account, next, { from, to })
      }
      if (action === `r`) {
        const { from, to } = await accountsOf(ctx, account, draft)
        const next: Draft = { ...draft, step: `summary`, useRate: true }
        await keep(ctx, account, next)
        await ctx.conversation.end()
        const shown = summary(ctx, next, from, to)
        return await editPressed(ctx, shown.text, shown.rows)
      }
      await save(ctx, account, draft)
    })

  return {
    commands: [{ name: `transfer`, description: `Move money between accounts`, handler: start }],
    callbacks: { [TRANSFER_CALLBACK]: press },
    conversations: {
      [TRANSFER_CONVERSATION]: { amount: (ctx, _data, account) => amountStep(ctx, account) },
    },
  }
}
