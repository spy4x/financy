import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Group, WebSocketMessageType } from "@shared/types"

// Holds the list of groups for the current user
export const list = signal<Group[]>([])

// Holds the currently selected groupId (default: first group)
export const selectedId = signal<number | null>(null)

export const group = {
  list,
  selectedId,
  init: () => {
    // Listen for group list updates from the server
    ws.onMessage((msg) => {
      if (msg.e !== "group") return
      if (msg.t === WebSocketMessageType.LIST && Array.isArray(msg.p)) {
        list.value = msg.p as Group[]
        if (list.value.length > 0) {
          selectedId.value = list.value[0].id
        } else {
          selectedId.value = null
        }
      }
    })
  },
}
