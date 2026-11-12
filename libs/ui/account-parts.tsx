import type { JSX } from "preact"
import { ICONS } from "@spy4x/preact-icons/registry"
import { ACCOUNT_KINDS, AccountKind } from "@domain/accounts"
import type { Translator } from "@spy4x/platform/universal/i18n"

/** An account as the screens draw it: what the person typed, its state and its derived balance. */
export interface AccountRow {
  id: string
  name: string
  kind: AccountKind
  /** The ISO 4217 code, or a coin's: every amount of the account is in its smallest unit. */
  currency: string
  /** What the account held when tracking started, in the currency's smallest unit. */
  startingBalance: number
  /** Computed by the server, never typed: the starting balance plus the account's entries. */
  balance: number
  isDefault: boolean
  archived: boolean
}

/** The glyph of each kind, from the icon registry, so the categories' picker draws the same set. */
const KIND_ICONS = {
  [AccountKind.CASH]: ICONS["banknote"].Icon,
  [AccountKind.BANK]: ICONS["landmark"].Icon,
  [AccountKind.CARD]: ICONS["credit-card"].Icon,
  [AccountKind.SAVINGS]: ICONS["piggy-bank"].Icon,
  [AccountKind.ASSET]: ICONS["briefcase"].Icon,
  [AccountKind.LIABILITY]: ICONS["hand-coins"].Icon,
  [AccountKind.CRYPTO]: ICONS["wallet"].Icon,
} as const

/** The `app` catalog key of each kind's name. */
const KIND_KEYS = {
  [AccountKind.CASH]: `AccountKinds.cash`,
  [AccountKind.BANK]: `AccountKinds.bank`,
  [AccountKind.CARD]: `AccountKinds.card`,
  [AccountKind.SAVINGS]: `AccountKinds.savings`,
  [AccountKind.ASSET]: `AccountKinds.asset`,
  [AccountKind.LIABILITY]: `AccountKinds.liability`,
  [AccountKind.CRYPTO]: `AccountKinds.crypto`,
} as const

/** The kind's name in `t`'s language: "Cash", "Bank". */
export function kindName(t: Translator<string>, kind: AccountKind): string {
  return t.t(KIND_KEYS[kind])
}

/** Every kind as a picker option, in the list's order. */
export function kindOptions(t: Translator<string>): { value: string; label: string }[] {
  return ACCOUNT_KINDS.map((kind) => ({ value: String(kind), label: kindName(t, kind) }))
}

/** The kind's icon in a small tile; decorative, since the row names the kind in its group heading. */
export function KindIcon({ kind }: { kind: AccountKind }): JSX.Element {
  const Icon = KIND_ICONS[kind]
  return (
    <span
      class="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-muted"
      aria-hidden="true"
    >
      <Icon class="size-5" />
    </span>
  )
}
