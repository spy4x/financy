import { WSStatus } from "@shared/types"
import { ws } from "@web/state/ws.ts"

export function NavHeader() {
  return (
    <div class="flex gap-4 h-16 shrink-0 items-center">
      <h3 class="text-purple-100 font-medium text-xl">
        Financy
      </h3>
      {(!ws.syncOp.value.inProgress && ws.status.value === WSStatus.CONNECTED)
        ? (
          <div class="inline-flex gap-1.5 items-center border rounded-md px-2.5 py-1 text-xs whitespace-nowrap font-medium capitalize border-green-600 bg-green-600 text-green-50 ml-auto">
            <span class="size-2 rounded-full inline-block bg-green-50" />
            <span>Live</span>
          </div>
        )
        : null}
    </div>
  )
}
