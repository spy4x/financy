/**
 * `/expense` and `/income` in the Telegram chat (spy4x/financy#103): the amount, then a summary
 * with Save, Account, Category and Cancel; `/expense 12.50` saves at once with every default.
 *
 * The talk's state is one draft per person in Valkey, made when the command starts. Its id is the
 * new entry's id and idempotency key, so a second Save stores nothing twice. Every button names
 * the draft by the last 8 characters of that id, so a button of an older talk is stale. Every id a
 * button carries is read again through the query bus as the person, and every write goes through
 * the command bus with the person's `actor`: the buses' own checks decide, the bot adds none.
 *
 * @module
 */

import { type } from "arktype"
import type { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import type {
  TelegramContext,
  TelegramConversationStore,
  TelegramInlineButton,
} from "@spy4x/integrations/telegram"
import { formatMoney, parseMoney } from "@spy4x/platform/universal/money-core"
import { negotiateLanguage } from "@spy4x/platform/universal/i18n"
import { UUID_PATTERN, uuidV7 } from "@spy4x/platform/universal/uuid"
import { AccountError, AccountGetQuery, AccountListQuery } from "@domain/accounts"
import { PlanError } from "@domain/billing"
import {
  CategoryError,
  CategoryGetQuery,
  CategoryKind,
  CategoryListQuery,
} from "@domain/categories"
import { GroupError, GroupListQuery, GroupSelectCommand, GroupSelectedQuery } from "@domain/groups"
import { type Language, LANGUAGES } from "@domain/identity"
import { amountDecimals } from "@domain/money"
import {
  entryDefaults,
  TransactionCreateCommand,
  TransactionError,
  TransactionKind,
  TransactionLatestQuery,
} from "@domain/transactions"
import { TransferError } from "@domain/transfers"
import { isolate } from "@server/mail/mail.ts"
import { translatorFor } from "@server/telegram/words.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import type { TelegramAccount, TelegramProduct } from "./extension.ts"

/** What the entry commands dispatch through, and where their drafts live. */
export interface EntryDeps {
  queryBus: Pick<QueryBus, `execute`>
  commandBus: Pick<CommandBus, `execute`>
  /** Valkey, as the bot's conversations use it. */
  store: TelegramConversationStore
}

/** The `callback_data` prefix of every entry button. */
export const ENTRY_CALLBACK = `entry`

/** The conversation that waits for a typed amount. */
export const ENTRY_CONVERSATION = `entry`

/** Seconds a draft waits, as long as a conversation does. */
export const ENTRY_DRAFT_SECONDS = 900

/**
 * The longest typed amount read, in characters. Longer text is refused before parsing, so the
 * parser's work and the draft's size stay bounded whatever is sent.
 */
export const AMOUNT_TEXT_MAX = 32

/** The most accounts, categories or households one list of buttons offers. */
export const PICK_MAX = 30

/** One talk's state, as stored. */
const draftSchema = type({
  id: UUID_PATTERN,
  kind: `1 | 2`,
  groupId: type(UUID_PATTERN).or(`null`),
  /** The region format amounts are read in; empty until the household is known. */
  locale: `string`,
  /** The amount as typed, kept to read it again in another account's currency. */
  amountText: `string <= ${AMOUNT_TEXT_MAX + 1}`,
  amount: `number.integer > 0 | null`,
  accountId: type(UUID_PATTERN).or(`null`),
  categoryId: type(UUID_PATTERN).or(`null`),
})
type Draft = typeof draftSchema.infer

/** What a button does; a pick carries the id it picks. */
const ACTIONS = [`save`, `acc`, `cat`, `back`, `cancel`, `a`, `c`, `g`] as const
type Action = typeof ACTIONS[number]
const BUTTON = new RegExp(`^(${ACTIONS.join(`|`)}):([0-9a-f]{8})(?::(.+))?$`)
const isUuid = type(UUID_PATTERN).allows

/** The entry commands' words in `language`, from the `app` catalog's `TelegramBot.*` keys. */
export function entryText(language: Language) {
  const t = translatorFor(language)
  return {
    kind: (kind: TransactionKind) =>
      kind === TransactionKind.EXPENSE ? t.t(`TelegramBot.expense`) : t.t(`TelegramBot.income`),
    askAmount: (currency: string, account: string) =>
      t.t(`TelegramBot.askAmount`, { currency, account: isolate(account) }),
    summary: (values: { kind: string; amount: string; account: string; category: string }) =>
      t.t(`TelegramBot.summary`, values),
    noCategory: t.t(`TelegramBot.noCategory`),
    save: t.t(`TelegramBot.save`),
    account: t.t(`TelegramBot.account`),
    category: t.t(`TelegramBot.category`),
    cancel: t.t(`TelegramBot.cancel`),
    back: t.t(`TelegramBot.back`),
    pickAccount: t.t(`TelegramBot.pickAccount`),
    pickCategory: t.t(`TelegramBot.pickCategory`),
    pickHousehold: t.t(`TelegramBot.pickHousehold`),
    needCategory: t.t(`TelegramBot.needCategory`),
    noCategories: t.t(`TelegramBot.noCategories`),
    saved: t.t(`TelegramBot.saved`),
    cancelled: t.t(`TelegramBot.cancelled`),
    noHousehold: t.t(`TelegramBot.noHousehold`),
    noAccount: t.t(`TelegramBot.noAccount`),
    notAmount: t.t(`TelegramBot.notAmount`),
    tooManyDecimals: (currency: string) => t.t(`TelegramBot.tooManyDecimals`, { currency }),
    tooLarge: t.t(`TelegramBot.tooLarge`),
    notPositive: t.t(`TelegramBot.notPositive`),
    viewer: t.t(`TelegramBot.viewer`),
    notMember: t.t(`TelegramBot.notMember`),
    unavailable: t.t(`TelegramBot.unavailable`),
    planFull: t.t(`TelegramBot.planFull`),
    stale: t.t(`TelegramBot.entryStale`),
  }
}
type EntryText = ReturnType<typeof entryText>

/** The words in the language Telegram reports for the person, else English. */
function textOf(ctx: TelegramContext): EntryText {
  return entryText(negotiateLanguage(ctx.from?.language_code, LANGUAGES, `en`))
}

/**
 * `text` read as an amount of `currency` in `locale`: the smallest unit, above zero, or the line
 * that says why not. Text longer than {@link AMOUNT_TEXT_MAX} is refused before it is parsed.
 */
export function readAmount(
  text: string,
  currency: string,
  locale: string,
  words: EntryText,
): { amount: number } | { refusal: string } {
  if (text.length > AMOUNT_TEXT_MAX) return { refusal: words.notAmount }
  const parsed = parseMoney(text, currency, locale, { decimals: amountDecimals(currency) })
  if (!parsed.ok) {
    if (parsed.error.type === `too-many-decimals`) {
      return { refusal: words.tooManyDecimals(currency) }
    }
    if (parsed.error.type === `too-large`) return { refusal: words.tooLarge }
    return { refusal: words.notAmount }
  }
  if (parsed.value <= 0) return { refusal: words.notPositive }
  return { amount: parsed.value }
}

/** `code` when `Intl` knows it as a locale, else `en`. Telegram's language code is untrusted. */
export function knownLocale(code: string | null | undefined): string {
  try {
    return (code && Intl.NumberFormat.supportedLocalesOf(code)[0]) || `en`
  } catch {
    return `en`
  }
}

/**
 * Whether the bot offers or takes `category` for an entry of `kind`: the command's own kind only.
 * The buses also take an expense category on an income, as a refund; the app offers that, the bot
 * does not, so `/income` lists income categories alone.
 */
function ofKind(kind: TransactionKind, category: CategoryKind): boolean {
  return category === (kind === TransactionKind.INCOME ? CategoryKind.INCOME : CategoryKind.EXPENSE)
}

/** The lines a refusal can be told in; a transfer words some of them its own way. */
export type RefusalWords = Pick<EntryText, `planFull` | `viewer` | `notMember` | `unavailable`>

/** The one line that tells the person why the buses refused, or `null` for any other failure. */
export function refusalOf(error: unknown, words: RefusalWords): string | null {
  if (error instanceof PlanError) return words.planFull
  const known = error instanceof TransactionError || error instanceof AccountError ||
    error instanceof CategoryError || error instanceof GroupError ||
    error instanceof TransferError
  if (!known) return null
  switch (error.code) {
    case `ROLE_INSUFFICIENT`:
      return words.viewer
    case `GROUP_NOT_FOUND`:
      return words.notMember
    case `ACCOUNT_NOT_FOUND`:
    case `CATEGORY_NOT_FOUND`:
    case `CATEGORY_KIND_MISMATCH`:
    case `TRANSFER_SAME_ACCOUNT`:
      return words.unavailable
    default:
      return null
  }
}

/** Thrown to stop a step after the person was told why; nothing is written. */
export class Refused extends Error {}

/** Runs one bus call; a refusal is told in one line and stops the step. */
export async function refusing<T>(
  ctx: TelegramContext,
  words: RefusalWords,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    const refusal = refusalOf(error, words)
    if (refusal === null) throw error
    await ctx.reply(refusal)
    throw new Refused()
  }
}

/** Runs a handler, ending quietly where {@link refusing} already told the person why. */
export async function told(work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (error) {
    if (!(error instanceof Refused)) throw error
  }
}

/** Replaces the pressed message's text and buttons; no buttons leaves it without any. */
export async function editPressed(
  ctx: TelegramContext,
  text: string,
  rows?: TelegramInlineButton[][],
): Promise<void> {
  const message = ctx.update.callback_query?.message
  if (!message) return
  await ctx.client.editMessageText({
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
    ...(rows ? { reply_markup: { inline_keyboard: rows } } : {}),
  })
}

/**
 * Where a person's one running talk is kept. `/expense`, `/income` and `/transfer` share it, so
 * starting one makes the buttons of the one before stale.
 */
export const talkKey = (ctx: TelegramContext, { userId }: TelegramAccount): string =>
  `financy:telegram:entry:${ctx.from?.id}:${userId}`

/** `/expense`, `/income`, their buttons and the conversation that reads a typed amount. */
export function createEntryCommands({ queryBus, commandBus, store }: EntryDeps): TelegramProduct {
  const keyOf = talkKey

  async function load(ctx: TelegramContext, account: TelegramAccount): Promise<Draft | null> {
    const raw = await store.get(keyOf(ctx, account))
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const draft = draftSchema(parsed)
    return draft instanceof type.errors ? null : draft
  }

  async function keep(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    await store.set(keyOf(ctx, account), JSON.stringify(draft), ENTRY_DRAFT_SECONDS)
  }

  async function drop(ctx: TelegramContext, account: TelegramAccount) {
    await store.del(keyOf(ctx, account))
  }

  const bus = <T>(ctx: TelegramContext, call: () => Promise<T>) => refusing(ctx, textOf(ctx), call)

  const tagOf = (draft: Draft) => draft.id.slice(-8)
  const button = (draft: Draft, text: string, action: Action, id?: string) => ({
    text,
    callback_data: `${ENTRY_CALLBACK}:${action}:${tagOf(draft)}${id ? `:${id}` : ``}`,
  })

  const edit = editPressed

  /** The draft's summary line and its buttons. */
  async function summary(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const words = textOf(ctx)
    const { actor } = account
    const groupId = draft.groupId!
    const { account: into } = await bus(
      ctx,
      () => queryBus.execute(new AccountGetQuery({ actor, groupId, id: draft.accountId! })),
    )
    const category = draft.categoryId
      ? (await bus(
        ctx,
        () => queryBus.execute(new CategoryGetQuery({ actor, groupId, id: draft.categoryId! })),
      )).category.name
      : null
    const text = words.summary({
      kind: words.kind(draft.kind),
      amount: formatMoney(draft.amount!, into.currency, draft.locale, {
        decimals: amountDecimals(into.currency),
      }),
      account: isolate(into.name),
      category: category === null ? words.noCategory : isolate(category),
    })
    const rows = [
      [button(draft, words.save, `save`)],
      [button(draft, words.account, `acc`), button(draft, words.category, `cat`)],
      [button(draft, words.cancel, `cancel`)],
    ]
    return { text, rows, currency: into.currency }
  }

  /** Asks for the amount in the draft's account, and waits for the answer. */
  async function ask(ctx: TelegramContext, account: TelegramAccount, draft: Draft, why = ``) {
    const { account: into } = await bus(ctx, () =>
      queryBus.execute(
        new AccountGetQuery({
          actor: account.actor,
          groupId: draft.groupId!,
          id: draft.accountId!,
        }),
      ))
    await keep(ctx, account, draft)
    const question = textOf(ctx).askAmount(into.currency, into.name)
    await ctx.reply(why ? `${why} ${question}` : question)
    await ctx.conversation.start(ENTRY_CONVERSATION)
  }

  /**
   * Stores the entry: no date, so the server takes today in the household's zone, and the
   * draft's id, so a second Save of the same talk answers with the entry the first one stored.
   */
  async function save(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const { text, currency } = await summary(ctx, account, draft)
    try {
      await bus(ctx, () =>
        commandBus.execute(
          new TransactionCreateCommand({
            actor: account.actor,
            groupId: draft.groupId!,
            id: draft.id,
            idempotencyKey: draft.id,
            kind: draft.kind,
            accountId: draft.accountId!,
            categoryId: draft.categoryId!,
            amount: draft.amount!,
            currency,
          }),
        ))
    } catch (error) {
      // The same id answered with a different entry: only an earlier Save of this talk made it.
      if (!(error instanceof TransactionError && error.code === `ID_ALREADY_EXISTS`)) throw error
    }
    await drop(ctx, account)
    return `${text}\n${textOf(ctx).saved}`
  }

  /**
   * Goes on once the household is known: the defaults (the person's last entry of this kind, else
   * the default account), then the typed amount or the question for it.
   */
  async function proceed(ctx: TelegramContext, account: TelegramAccount, draft: Draft) {
    const { actor } = account
    const groupId = draft.groupId!
    const words = textOf(ctx)
    const [{ value: preferences }, { accounts }, { categories }, { transaction: last }] = await bus(
      ctx,
      () =>
        Promise.all([
          queryBus.execute(new PreferencesGetQuery({ actor })),
          queryBus.execute(new AccountListQuery({ actor, groupId })),
          queryBus.execute(new CategoryListQuery({ actor, groupId })),
          queryBus.execute(new TransactionLatestQuery({ actor, groupId, kind: draft.kind })),
        ]),
    )
    const defaults = entryDefaults(last, accounts)
    if (!defaults.account) {
      await drop(ctx, account)
      return void await ctx.reply(words.noAccount)
    }
    const live = categories.find((category) =>
      category.id === defaults.last?.categoryId && category.archivedAt === null &&
      ofKind(draft.kind, category.kind)
    )
    draft.locale = knownLocale(preferences.locale ?? ctx.from?.language_code)
    draft.accountId = defaults.account.id
    draft.categoryId = live?.id ?? null
    if (!draft.amountText) return await ask(ctx, account, draft)
    const read = readAmount(draft.amountText, defaults.account.currency, draft.locale, words)
    if (`refusal` in read) return await ask(ctx, account, draft, read.refusal)
    draft.amount = read.amount
    if (draft.categoryId) return void await ctx.reply(await save(ctx, account, draft))
    await keep(ctx, account, draft)
    const shown = await summary(ctx, account, draft)
    await ctx.reply(`${shown.text}\n${words.needCategory}`, {
      reply_markup: { inline_keyboard: shown.rows },
    })
  }

  /** `/expense` or `/income`, with or without the amount after it. */
  const start = (kind: TransactionKind) => (ctx: TelegramContext, account: TelegramAccount) =>
    told(async () => {
      await ctx.conversation.end()
      const { actor } = account
      const draft: Draft = {
        id: uuidV7(),
        kind,
        groupId: null,
        locale: ``,
        amountText: ctx.args.slice(0, AMOUNT_TEXT_MAX + 1),
        amount: null,
        accountId: null,
        categoryId: null,
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

  /** The typed amount, read in the draft's account currency. */
  async function amountStep(ctx: TelegramContext, account: TelegramAccount) {
    if (ctx.text === undefined) return
    const words = textOf(ctx)
    const draft = await load(ctx, account)
    if (!draft?.groupId || !draft.accountId) {
      await ctx.reply(words.stale)
      return { done: true } as const
    }
    let result: { done: true } | undefined
    await told(async () => {
      const { account: into } = await bus(ctx, () =>
        queryBus.execute(
          new AccountGetQuery({
            actor: account.actor,
            groupId: draft.groupId!,
            id: draft.accountId!,
          }),
        ))
      const typed = ctx.text!.trim()
      const read = readAmount(typed, into.currency, draft.locale, words)
      if (`refusal` in read) {
        return void await ctx.reply(`${read.refusal} ${words.askAmount(into.currency, into.name)}`)
      }
      const next = { ...draft, amountText: typed, amount: read.amount }
      await keep(ctx, account, next)
      const shown = await summary(ctx, account, next)
      await ctx.reply(shown.text, { reply_markup: { inline_keyboard: shown.rows } })
      result = { done: true }
    })
    return result
  }

  /** A press of any entry button. */
  const press = (ctx: TelegramContext, account: TelegramAccount) =>
    told(async () => {
      const words = textOf(ctx)
      const match = BUTTON.exec(ctx.args)
      const draft = await load(ctx, account)
      const action = match?.[1] as Action | undefined
      const id = match?.[3]
      const picks = action === `a` || action === `c` || action === `g`
      if (
        !match || !draft || tagOf(draft) !== match[2] || picks !== (id !== undefined) ||
        (id !== undefined && !isUuid(id)) || (action === `g`) !== (draft.groupId === null)
      ) {
        await edit(ctx, words.stale)
        return
      }
      const { actor } = account
      if (action === `g`) {
        await bus(ctx, () => commandBus.execute(new GroupSelectCommand({ actor, groupId: id! })))
        await edit(ctx, words.pickHousehold)
        return await proceed(ctx, account, { ...draft, groupId: id! })
      }
      const groupId = draft.groupId!
      if (action === `cancel`) {
        await drop(ctx, account)
        await ctx.conversation.end()
        return await edit(ctx, words.cancelled)
      }
      if (draft.amount === null) {
        // The talk waits for an amount; its old summary's buttons no longer apply.
        return await edit(ctx, words.stale)
      }
      if (action === `save`) {
        if (!draft.categoryId) return await pickCategory(ctx, account, draft, words.needCategory)
        return await edit(ctx, await save(ctx, account, draft))
      }
      if (action === `acc`) {
        const { accounts } = await bus(ctx, () =>
          queryBus.execute(new AccountListQuery({ actor, groupId })))
        const open = accounts.filter((into) =>
          into.archivedAt === null
        )
          .sort((a, b) => Number(b.id === draft.accountId) - Number(a.id === draft.accountId))
          .slice(0, PICK_MAX)
        return await edit(ctx, words.pickAccount, [
          ...open.map((into) => [button(draft, `${into.name} · ${into.currency}`, `a`, into.id)]),
          [button(draft, words.back, `back`)],
        ])
      }
      if (action === `cat`) return await pickCategory(ctx, account, draft, words.pickCategory)
      if (action === `a`) {
        const { account: into } = await bus(ctx, () =>
          queryBus.execute(new AccountGetQuery({ actor, groupId, id: id! })))
        if (into.archivedAt !== null) {
          return void await ctx.reply(words.unavailable)
        }
        const { account: was } = await bus(ctx, () =>
          queryBus.execute(new AccountGetQuery({ actor, groupId, id: draft.accountId! })))
        const next = { ...draft, accountId: into.id }
        if (into.currency !== was.currency) {
          const read = readAmount(draft.amountText, into.currency, draft.locale, words)
          if (`refusal` in read) {
            await edit(ctx, words.pickAccount)
            return await ask(ctx, account, { ...next, amount: null }, read.refusal)
          }
          next.amount = read.amount
        }
        await keep(ctx, account, next)
        const shown = await summary(ctx, account, next)
        return await edit(ctx, shown.text, shown.rows)
      }
      if (action === `c`) {
        const { category } = await bus(ctx, () =>
          queryBus.execute(new CategoryGetQuery({ actor, groupId, id: id! })))
        if (category.archivedAt !== null || !ofKind(draft.kind, category.kind)) {
          return void await ctx.reply(words.unavailable)
        }
        const next = { ...draft, categoryId: category.id }
        await keep(ctx, account, next)
        const shown = await summary(ctx, account, next)
        return await edit(ctx, shown.text, shown.rows)
      }
      const shown = await summary(ctx, account, draft)
      await edit(ctx, shown.text, shown.rows)
    })

  /** Turns the pressed message into the list of live categories of the draft's kind. */
  async function pickCategory(
    ctx: TelegramContext,
    account: TelegramAccount,
    draft: Draft,
    title: string,
  ) {
    const words = textOf(ctx)
    const { categories } = await bus(
      ctx,
      () =>
        queryBus.execute(new CategoryListQuery({ actor: account.actor, groupId: draft.groupId! })),
    )
    const live = categories
      .filter((category) => category.archivedAt === null && ofKind(draft.kind, category.kind))
      .sort((a, b) => Number(b.id === draft.categoryId) - Number(a.id === draft.categoryId))
      .slice(0, PICK_MAX)
    if (live.length === 0) return void await ctx.reply(words.noCategories)
    await edit(ctx, title, [
      ...live.map((category) => [button(draft, category.name, `c`, category.id)]),
      [button(draft, words.back, `back`)],
    ])
  }

  return {
    commands: [
      { name: `expense`, description: `Add an expense`, handler: start(TransactionKind.EXPENSE) },
      { name: `income`, description: `Add an income`, handler: start(TransactionKind.INCOME) },
    ],
    callbacks: { [ENTRY_CALLBACK]: press },
    conversations: {
      [ENTRY_CONVERSATION]: { amount: (ctx, _data, account) => amountStep(ctx, account) },
    },
  }
}
