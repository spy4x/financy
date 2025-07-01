import { IconCheck, IconChevronDown, IconCog6Tooth } from "@client/icons"
import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { group } from "@web/state/group.ts"
import { Link } from "wouter-preact"

export function GroupSelector() {
  return (
    <div class="">
      <div class="text-xs font-medium text-purple-200 dark:text-purple-300 mb-2">
        Selected Group
      </div>
      <div class="flex items-center gap-2">
        <Dropdown
          trigger={
            <div class="flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors grow bg-purple-800 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 text-purple-100 dark:text-purple-200">
              <span class="truncate">
                {group.list.value.find((g) => g.id === group.selectedId.value)?.name ||
                  "Select Group"}
              </span>
              <IconChevronDown class="size-4 ml-2 shrink-0" />
            </div>
          }
          triggerClasses="grow"
          panelClasses="w-full min-w-0"
          containerClasses="flex-1"
        >
          <div class="py-1">
            {group.list.value.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  group.selectedId.value = g.id
                }}
                class="flex items-center justify-between w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span class="font-medium">{g.name}</span>
                {group.selectedId.value === g.id && (
                  <IconCheck class="size-4 text-purple-600 dark:text-purple-400" />
                )}
              </button>
            ))}
          </div>
        </Dropdown>
        <Link
          href="/groups"
          class="flex items-center justify-center p-2 text-purple-100 dark:text-purple-200 bg-purple-800 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 rounded-md transition-colors shrink-0"
          title="Group Settings"
        >
          <IconCog6Tooth class="size-5" />
        </Link>
      </div>
    </div>
  )
}
