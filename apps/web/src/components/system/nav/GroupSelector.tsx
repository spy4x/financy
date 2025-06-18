import { IconCheck, IconChevronDown } from "@client/icons"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { group } from "@web/state/group.ts"

export function GroupSelector() {
  if (group.list.value.length === 0) {
    return null
  }

  return (
    <div class="border-t border-purple-800 pt-4 mt-4">
      <div class="text-xs font-medium text-purple-200 mb-2">
        Selected Group
      </div>
      <Dropdown
        button={
          <div class="flex items-center justify-between w-full px-3 py-2 text-sm bg-purple-800 hover:bg-purple-700 rounded-md text-purple-100 transition-colors">
            <span class="truncate">
              {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                "Select Group"}
            </span>
            <IconChevronDown class="size-4 ml-2 shrink-0" />
          </div>
        }
        buttonClass="w-full"
        extraClass="w-full min-w-0"
        containerClass="w-full"
        type="last"
      >
        <div class="py-1">
          {group.list.value.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                group.selectedId.value = g.id
              }}
              class="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <span class="font-medium">{g.name}</span>
              {group.selectedId.value === g.id && <IconCheck class="size-4 text-purple-600" />}
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  )
}
