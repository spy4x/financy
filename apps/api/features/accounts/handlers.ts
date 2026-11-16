import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  AccountArchiveCommand,
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountError,
  AccountGetQuery,
  AccountListQuery,
  type AccountRepository,
  AccountRestoreCommand,
  AccountSetDefaultCommand,
  AccountTotalQuery,
  AccountUpdateCommand,
  type AccountWidgetQuery,
  assertCanReadAccounts,
  assertCanWriteAccounts,
  assertKindFitsCurrency,
  type HouseholdTotal,
  householdTotal,
  type ListedAccount,
} from "@domain/accounts"
import {
  type CoinPrice,
  ECB_BASE,
  type HouseholdSettings,
  isCoin,
  type RateLookup,
} from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import type { ExchangeRate } from "@spy4x/platform/universal/money"

/** What every account handler needs: the accounts, and the actor's role in the household. */
export interface AccountHandlerDependencies {
  accounts: AccountRepository
  groups: GroupRoleLookup
}

/**
 * Throws unless the entitlement gate set the plan's cap on the command: a bus without the gate
 * would add accounts to a household that has no plan, so it fails closed.
 */
function assertGated(
  allowance: number | null | undefined,
  command: string,
): asserts allowance is number | null {
  if (allowance === undefined) {
    throw new Error(`${command} reached its handler without the entitlement gate`)
  }
}

/**
 * The account handlers. Each one decides who may act before it touches an account: every member
 * reads, an editor or above writes, and a stranger is told the household does not exist. The
 * repository checks the role again inside each write's transaction, so a write that races a
 * removal or a demotion is refused too. Session strength is checked earlier, by the session gate.
 */
export function createAccountCreateHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountCreateCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "AccountCreateCommand")
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    assertKindFitsCurrency(data.kind, data.currency)
    return await accounts.create(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        currency: data.currency,
        startingBalance: data.startingBalance,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
  }
}

export function createAccountUpdateHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    assertKindFitsCurrency(data.kind, data.currency)
    const account = await accounts.update(
      {
        groupId: data.groupId,
        id: data.id,
        name: data.name,
        kind: data.kind,
        currency: data.currency,
        startingBalance: data.startingBalance,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountArchiveHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountArchiveCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.archive(
      {
        groupId: data.groupId,
        id: data.id,
        archived: data.archived,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountSetDefaultHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountSetDefaultCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.setDefault(
      {
        groupId: data.groupId,
        id: data.id,
        isDefault: data.isDefault,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountDeleteHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountDeleteCommand> {
  return async ({ data }) => {
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.delete(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountRestoreHandler(
  { accounts, groups }: AccountHandlerDependencies,
): CommandHandler<AccountRestoreCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, "AccountRestoreCommand")
    assertCanWriteAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.restore(
      { allowance, groupId: data.groupId, id: data.id, requestId: data.requestId },
      data.actor.userId,
    )
    return { account }
  }
}

export function createAccountListHandler(
  { accounts, groups }: AccountHandlerDependencies,
): QueryHandler<AccountListQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    return { accounts: await accounts.list(data.groupId, data.deleted ?? false) }
  }
}

export function createAccountGetHandler(
  { accounts, groups }: AccountHandlerDependencies,
): QueryHandler<AccountGetQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await groups.roleOf(data.groupId, data.actor.userId))
    const account = await accounts.get(data.groupId, data.id)
    if (!account) throw new AccountError("ACCOUNT_NOT_FOUND", "Account not found")
    return { account }
  }
}

/** What the total needs besides the accounts: the base currency, the rates and today's date. */
export interface AccountTotalDependencies extends AccountHandlerDependencies {
  settings: { get(groupId: string): Promise<HouseholdSettings> }
  /**
   * The rate on `date` or the latest earlier one, from any source, and today's coin prices
   * (`PostgresRateRepository`).
   */
  rates: {
    lookup(base: string, quote: string, date: string): Promise<RateLookup>
    coinPrices(): Promise<CoinPrice[]>
  }
  /** Today, `YYYY-MM-DD` in UTC: the day the rates are looked up for. */
  today(): string
}

/**
 * `account.total`: every member reads the household's total in its base currency. Each currency
 * other than the base is looked up once, at the latest rate on or before today; the conversion and
 * the sum are `householdTotal`'s. Deleted accounts are not in the list, archived ones are.
 *
 * A coin is valued at its stored price of today, in euros, crossed with the euro's rate when the
 * base is another currency. Only the total reads coin prices: `rates.lookup` stays fiat-only,
 * because transactions and transfers store what it returns, and today's coin price must never be
 * written into history.
 */
export function createAccountTotalHandler(
  dependencies: AccountTotalDependencies,
): QueryHandler<AccountTotalQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    return { total: (await readHousehold(dependencies, data.groupId)).total }
  }
}

/**
 * "How much do we have?" on the overview: the household's accounts as `account.list` lists them,
 * and the total `account.total` answers, from the one read both use, so the card never disagrees
 * with the Accounts screen. A stranger is told the household does not exist before anything is
 * read.
 */
export function createAccountWidgetHandler(
  dependencies: AccountTotalDependencies,
): QueryHandler<AccountWidgetQuery> {
  return async ({ data }) => {
    assertCanReadAccounts(await dependencies.groups.roleOf(data.groupId, data.actor.userId))
    const { listed, total } = await readHousehold(dependencies, data.groupId)
    return {
      accounts: listed.map((account) => ({
        id: account.id,
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        balance: account.balance,
        archived: account.archivedAt !== null,
      })),
      total,
    }
  }
}

/**
 * The household's live accounts and their total: the one read behind `account.total` and the
 * balances widget. The caller checks the role first.
 */
async function readHousehold(
  { accounts, settings, rates, today }: AccountTotalDependencies,
  groupId: string,
): Promise<{ listed: ListedAccount[]; total: HouseholdTotal }> {
  const [listed, { baseCurrency }] = await Promise.all([
    accounts.list(groupId, false),
    settings.get(groupId),
  ])
  const date = today()
  const held = [...new Set(listed.map((account) => account.currency))]
  const coins = held.some(isCoin)
  // A coin's price is in euros, so a coin in a household of another base needs the euro's rate.
  const foreign = [
    ...new Set([...held.filter((code) => !isCoin(code)), ...coins ? [ECB_BASE] : []]),
  ]
    .filter((code) => code !== baseCurrency)
  const [found, prices] = await Promise.all([
    Promise.all(foreign.map(async (code) => {
      const lookup = await rates.lookup(code, baseCurrency, date)
      return [code, lookup.found ? lookup.rate : null] as [string, ExchangeRate | null]
    })),
    coins ? rates.coinPrices() : [],
  ])
  const coinPrices = new Map(prices.map((price) => [price.coin, price]))
  return { listed, total: householdTotal(listed, baseCurrency, new Map(found), coinPrices) }
}
