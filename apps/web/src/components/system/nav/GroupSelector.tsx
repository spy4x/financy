import { IconCheck, IconChevronDown } from "@client/icons"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { group } from "@web/state/group.ts"

interface Props {
  variant?: "nav" | "page"
}

export function GroupSelector({ variant = "nav" }: Props) {
  if (group.list.value.length === 0) {
    return null
  }

  const isNavVariant = variant === "nav"

  return (
    <div class={isNavVariant ? "border-t border-purple-800 pt-4 mt-4" : "-mt-2"}>
      {isNavVariant && (
        <div class="text-xs font-medium text-purple-200 mb-2">
          Selected Group
        </div>
      )}
      <Dropdown
        trigger={
          <div
            class={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
              isNavVariant
                ? "bg-purple-800 hover:bg-purple-700 text-purple-100 w-full"
                : "bg-white border border-gray-300 hover:border-gray-400 text-gray-900 shadow-sm min-w-0"
            }`}
          >
            <span class="truncate">
              {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                "Select Group"}
            </span>
            <IconChevronDown class="size-4 ml-2 shrink-0" />
          </div>
        }
        triggerClasses={isNavVariant ? "w-full" : ""}
        panelClasses={isNavVariant ? "w-full min-w-0" : "min-w-48"}
        containerClasses={isNavVariant ? "w-full" : ""}
        vertical={isNavVariant ? "up" : "down"}
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
              {group.selectedId.value === g.id && (
                <IconCheck class={`size-4 ${isNavVariant ? "text-purple-600" : "text-blue-600"}`} />
              )}
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  )
}
