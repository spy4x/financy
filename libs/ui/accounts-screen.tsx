import type { ComponentChildren, JSX } from "preact"
import { Badge } from "@spy4x/preact-ui/badge"
import { Button } from "@spy4x/preact-ui/button"
import { Dropdown, DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Link } from "@spy4x/preact-ui/link"
import { Stack } from "@spy4x/preact-ui/layout"
import { MoneyDisplay } from "@spy4x/preact-ui/money-display"
import { PageAction, PageHeader } from "@spy4x/preact-ui/page-header"
import { IconEllipsisVertical, IconPlus } from "@spy4x/preact-icons"
import { ACCOUNT_KINDS, ACCOUNT_RESTORE_DAYS, type HouseholdTotal } from "@domain/accounts"
import {
  ListCard,
  ListEmpty,
  MENU_TRIGGER_CLASSES,
  NoGroup,
  type NotesGroup,
} from "./notes-screen.tsx"
import { type AccountRow, KindIcon, kindName } from "./account-parts.tsx"
import { AccountsTotal } from "./accounts-total.tsx"
import { ACCOUNT_PATHS, type Navigate } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"
import type { PlanRefusal } from "@domain/billing"

export type { AccountRow }

/** The changes a row's menu offers; each is left out for a viewer. */
export interface AccountActions {
  onArchive(id: string, archived: boolean): Promise<void>
  onSetDefault(id: string, isDefault: boolean): Promise<void>
  /** Deletes at once; the view offers Undo in a toast. */
  onDelete(id: string): Promise<void>
  onRestore(id: string): Promise<void>
}

export interface AccountsScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** The household's live accounts, archived ones included. */
  accounts: readonly AccountRow[]
  /** The accounts in the trash while they are shown, else `null`. */
  deleted: readonly AccountRow[] | null
  /**
   * The household's total in its base currency: `null` while it is read, `undefined` for no card
   * (its read failed with nothing to show). A household with no accounts never shows the card.
   */
  total?: HouseholdTotal | null
  showArchived: boolean
  onShowArchived?: (show: boolean) => void
  onShowDeleted?: (show: boolean) => void
  loading: boolean
  /** The error of the list itself, such as a failed read or a refused change. */
  listError: Message | null
  /** The plan's refusal of a restore: the household has no paid plan. Shown in place of `listError`. */
  listPlan?: PlanRefusal | null
  /** The account whose change is in flight: its menu is disabled meanwhile. */
  pendingId?: string | null
  actions?: AccountActions
  navigate?: Navigate
}

/**
 * A household's accounts at `/accounts`: grouped by kind in a fixed order, each with its currency
 * and its balance, the default marked. "Add account" and each name lead to the editor; each row's
 * menu archives, sets the default or deletes. Archived accounts show only on request; the trash
 * lists deleted ones with Restore.
 */
export function AccountsScreen(props: AccountsScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  if (!group) {
    return (
      <Page>
        <PageHeader title={t.t(`Accounts.title`)} />
        <NoGroup loading={props.loading} navigate={navigate} />
      </Page>
    )
  }
  const canWrite = group.canWrite
  const trash = props.deleted !== null
  return (
    <Page>
      <PageHeader
        title={trash ? t.t(`Accounts.trashTitle`) : t.t(`Accounts.title`)}
        subtitle={group.name}
        subtitleDataE2E="accounts-group"
        back={trash ? { href: ACCOUNT_PATHS.list, label: t.t(`Accounts.back`) } : undefined}
        navigate={trash ? () => props.onShowDeleted?.(false) : navigate}
        action={canWrite && !trash && (
          <PageAction
            label={t.t(`Accounts.add`)}
            Icon={IconPlus}
            href={ACCOUNT_PATHS.new}
            navigate={navigate}
            dataE2E="account-new"
          />
        )}
        menuDataE2E="accounts-menu"
        menu={!trash && (
          <>
            <DropdownItem
              onClick={() => props.onShowArchived?.(!props.showArchived)}
              dataE2E="accounts-toggle-archived"
            >
              {props.showArchived ? t.t(`Accounts.hideArchived`) : t.t(`Accounts.showArchived`)}
            </DropdownItem>
            <DropdownItem
              onClick={() => props.onShowDeleted?.(true)}
              dataE2E="accounts-show-deleted"
            >
              {t.t(`Accounts.showDeleted`)}
            </DropdownItem>
          </>
        )}
      />
      <Stack>
        {!canWrite && (
          <p class="text-sm text-muted" data-e2e="accounts-read-only">
            {t.t(`Accounts.readOnly`)}
          </p>
        )}
        {props.listPlan && props.group
          ? (
            <PlanRefusalNotice
              groupId={props.group.id}
              refusal={props.listPlan}
              navigate={props.navigate}
            />
          )
          : <ErrorState message={messageText(t, props.listError)} />}
        {!trash && props.total !== undefined && (props.accounts.length > 0 || props.loading) && (
          <AccountsTotal total={props.total} />
        )}
        {trash
          ? <Trash {...props} rows={props.deleted!} canWrite={canWrite} />
          : <Live {...props} canWrite={canWrite} />}
      </Stack>
    </Page>
  )
}

type Listed = AccountsScreenProps & { canWrite: boolean }

/** The live accounts, one card per kind that has any. */
function Live(props: Listed): JSX.Element {
  const t = useAppText()
  const { canWrite, navigate } = props
  const shown = props.accounts.filter((account) => props.showArchived || !account.archived)
  if (shown.length === 0) {
    const hidden = props.accounts.length > 0
    return (
      <ListEmpty
        title={props.loading
          ? t.t(`Accounts.loading`)
          : hidden
          ? t.t(`Accounts.allArchived`)
          : canWrite
          ? t.t(`Accounts.empty`)
          : t.t(`Accounts.emptyViewer`)}
        description={props.loading || !canWrite || hidden ? undefined : t.t(`Accounts.emptyHint`)}
        action={!props.loading && canWrite && !hidden && (
          <Button
            href={ACCOUNT_PATHS.new}
            navigate={navigate}
            variant="secondary"
            data-e2e="account-new-empty"
          >
            {t.t(`Accounts.add`)}
          </Button>
        )}
      />
    )
  }
  return (
    <>
      {ACCOUNT_KINDS.map((kind) => {
        const rows = shown.filter((account) => account.kind === kind)
        if (rows.length === 0) return null
        const heading = `accounts-kind-${kind}`
        return (
          <section key={kind} aria-labelledby={heading} class="flex flex-col gap-2">
            <h2 id={heading} class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {kindName(t, kind)}
            </h2>
            <ListCard dataE2E={`account-list-${kind}`}>
              {rows.map((account) => (
                <Row key={account.id} account={account} {...props} canWrite={canWrite}>
                  {canWrite && props.actions && (
                    <Dropdown
                      trigger={<IconEllipsisVertical class="size-5" />}
                      triggerLabel={t.t(`Accounts.actions`, { name: account.name })}
                      triggerClasses={MENU_TRIGGER_CLASSES}
                      triggerDataE2E="account-menu"
                    >
                      <DropdownItem
                        href={ACCOUNT_PATHS.account(account.id)}
                        navigate={navigate}
                        dataE2E="account-menu-edit"
                      >
                        {t.t(`Accounts.edit`)}
                      </DropdownItem>
                      {!account.archived && (
                        <DropdownItem
                          onClick={() =>
                            void props.actions!.onSetDefault(account.id, !account.isDefault)}
                          disabled={props.pendingId === account.id}
                          dataE2E="account-default"
                        >
                          {account.isDefault
                            ? t.t(`Accounts.clearDefault`)
                            : t.t(`Accounts.makeDefault`)}
                        </DropdownItem>
                      )}
                      <DropdownItem
                        onClick={() => void props.actions!.onArchive(account.id, !account.archived)}
                        disabled={props.pendingId === account.id}
                        dataE2E="account-archive"
                      >
                        {account.archived ? t.t(`Accounts.unarchive`) : t.t(`Accounts.archive`)}
                      </DropdownItem>
                      <DropdownItem
                        onClick={() =>
                          props.actions!.onDelete(account.id)}
                        disabled={props.pendingId === account.id}
                        danger
                        dataE2E="account-delete"
                      >
                        {t.t(`Accounts.delete`)}
                      </DropdownItem>
                    </Dropdown>
                  )}
                </Row>
              ))}
            </ListCard>
          </section>
        )
      })}
    </>
  )
}

/** The trash: deleted accounts with Restore, and when they go for good. */
function Trash(props: Listed & { rows: readonly AccountRow[] }): JSX.Element {
  const t = useAppText()
  return (
    <>
      <p class="text-sm text-muted">{t.t(`Accounts.trashHint`, { days: ACCOUNT_RESTORE_DAYS })}</p>
      {props.rows.length === 0
        ? <ListEmpty title={props.loading ? t.t(`Accounts.loading`) : t.t(`Accounts.trashEmpty`)} />
        : (
          <ListCard dataE2E="account-trash">
            {props.rows.map((account) => (
              <Row key={account.id} account={account} {...props} canWrite={false}>
                {props.canWrite && props.actions && (
                  <Button
                    variant="outline"
                    class="min-h-11 sm:min-h-9"
                    onClick={() => void props.actions!.onRestore(account.id)}
                    busy={props.pendingId === account.id}
                    aria-label={t.t(`Accounts.restoreNamed`, { name: account.name })}
                    data-e2e="account-restore"
                  >
                    {t.t(`Accounts.restore`)}
                  </Button>
                )}
              </Row>
            ))}
          </ListCard>
        )}
    </>
  )
}

/**
 * One account: its kind's icon, its name (a link to the editor for an editor), the currency code
 * with the badges, and the balance. At 390 px the code and the badges drop to a meta line under
 * the name, which wraps to two lines, so neither the name nor the balance is cut to one word.
 */
function Row(
  { account, canWrite, navigate, children }: Listed & {
    account: AccountRow
    children?: ComponentChildren
  },
): JSX.Element {
  const t = useAppText()
  // An archived account reads as set aside by its badge and a muted name, never by fading the row:
  // the muted token keeps the text at the house contrast, which opacity would drop below 4.5:1.
  const muted = account.archived ? "text-muted" : ""
  return (
    <li
      class="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6"
      data-e2e={`account-${account.id}`}
    >
      <KindIcon kind={account.kind} />
      {
        /* The name stands alone and wraps to two lines; the badges sit on the meta line with the
          currency, so a badge never squeezes the name down to its first word on a phone. */
      }
      <div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        {canWrite
          ? (
            <Link
              href={ACCOUNT_PATHS.account(account.id)}
              navigate={navigate}
              class={`min-w-0 line-clamp-2 break-words rounded-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus ${muted}`}
              data-e2e="account-name"
            >
              <bdi>{account.name}</bdi>
            </Link>
          )
          : (
            <span
              class={`min-w-0 line-clamp-2 break-words font-medium ${muted}`}
              data-e2e="account-name"
            >
              <bdi>{account.name}</bdi>
            </span>
          )}
        <div
          class="flex flex-wrap items-center gap-2 sm:ms-auto sm:shrink-0"
          data-e2e="account-meta"
        >
          <span
            class="text-sm text-muted sm:order-last"
            translate={false}
            data-e2e="account-currency"
          >
            {account.currency}
          </span>
          {account.isDefault && (
            <Badge text={t.t(`Accounts.defaultBadge`)} color="blue" type="outline" />
          )}
          {account.archived && (
            <Badge text={t.t(`Accounts.archivedBadge`)} color="gray" type="outline" />
          )}
        </div>
      </div>
      <span class="shrink-0 text-end font-medium" data-e2e="account-balance">
        <MoneyDisplay amount={account.balance} currency={account.currency} tone="negative" />
      </span>
      {children && <div class="relative -my-2 -me-2 shrink-0">{children}</div>}
    </li>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page({ children }: { children?: ComponentChildren }): JSX.Element {
  return <div class="flex flex-col gap-8">{children}</div>
}
