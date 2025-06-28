import { WSStatus } from "@shared/types"
import { ws } from "@web/state/ws.ts"
import { ThemeToggle } from "@web/components/ui/ThemeToggle.tsx"

export function NavHeader() {
  return (
    <div class="flex gap-4 h-16 shrink-0 items-center">
      <h3 class="text-purple-100 font-medium text-xl">
        Financy
      </h3>
      <div class="flex items-center gap-2 ml-auto">
        <ThemeToggle className="text-purple-100 hover:bg-purple-800/50 hover:text-purple-50 border border-purple-600/30 hover:border-purple-500" />
        {(!ws.syncOp.value.inProgress && ws.status.value === WSStatus.CONNECTED)
          ? (
            <div class="inline-flex gap-1.5 items-center border rounded-md px-2.5 py-1 text-xs whitespace-nowrap font-medium capitalize border-green-600 bg-green-600 text-green-50">
              <span class="size-2 rounded-full inline-block bg-green-50" />
              <span>Live</span>
            </div>
          )
          : null}
      </div>
    </div>
  )
}
