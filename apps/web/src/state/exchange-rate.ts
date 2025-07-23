import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { ExchangeRate, WebSocketMessageType } from "@shared/types"

const list = signal<ExchangeRate[]>([])

export const exchangeRate = {
  list,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "exchangeRate") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          exchangeRate.list.value = Array.isArray(msg.p) ? (msg.p as ExchangeRate[]) : []
          break
      }
    })
  },
  /**
   * Get all exchange rates (for use with currency conversion helpers)
   */
  getAll(): ExchangeRate[] {
    return exchangeRate.list.value
  },
}
