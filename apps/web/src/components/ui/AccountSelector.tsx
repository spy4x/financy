import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { useComputed } from "@preact/signals"

interface AccountSelectorProps {
  value: number | null
  onChange: (accountId: number | null) => void
  placeholder?: string
  required?: boolean
  className?: string
  id?: string
  disabled?: boolean
  groupId?: number // If provided, filters accounts by group, otherwise uses selected group
  includeDeleted?: boolean // Whether to include soft-deleted accounts in the list
  excludeAccountId?: number // Exclude a specific account from the list (useful for transfers)
  dataE2E?: string // Custom data-e2e attribute
}

export function AccountSelector({
  value,
  onChange,
  placeholder = "Select account...",
  required = false,
  className = "",
  id,
  disabled = false,
  groupId,
  includeDeleted = false,
  excludeAccountId,
  dataE2E = "account-selector",
}: AccountSelectorProps) {
  const filteredAccounts = useComputed(() => {
    const targetGroupId = groupId || group.selectedId.value
    if (!targetGroupId) return []

    return account.list.value
      .filter((acc) => {
        // Filter by group
        if (acc.groupId !== targetGroupId) return false

        // Filter deleted accounts unless explicitly included
        if (!includeDeleted && acc.deletedAt) return false

        // Exclude specific account if provided
        if (excludeAccountId && acc.id === excludeAccountId) return false

        return true
      })
      .sort((a, b) => {
        // Active items first, then deleted items (if included)
        const aIsDeleted = !!a.deletedAt
        const bIsDeleted = !!b.deletedAt

        if (aIsDeleted !== bIsDeleted) {
          return aIsDeleted ? 1 : -1
        }

        // Within same status, sort by name
        return a.name.localeCompare(b.name)
      })
  })

  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const selectedId = target.value === "" ? null : parseInt(target.value)
    onChange(selectedId)
  }

  return (
    <select
      id={id}
      value={value || ""}
      onChange={handleChange}
      required={required}
      disabled={disabled}
      class={`input ${className}`}
      data-e2e={dataE2E}
    >
      <option value="">{placeholder}</option>
      {filteredAccounts.value.map((acc) => {
        const currencyInfo = currency.getById(acc.currencyId)
        return (
          <option key={acc.id} value={acc.id}>
            {acc.name} ({currencyInfo.code})
            {acc.deletedAt ? " (deleted)" : ""}
          </option>
        )
      })}
    </select>
  )
}
