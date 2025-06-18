import { WSContext } from "hono/ws"
import type { SyncModel, WebSocketMessage } from "@shared/types"
import { SyncModelName } from "@shared/types"

import { db } from "./db.ts"
import { log } from "./log.ts"
import { WebSocketMessageRouter } from "../routes/websockets/+index.ts"

export type WS = WSContext & { createdAt: number; heartbeatInterval: number }

const all: WS[] = []
const socketsByUser = new Map<number, WS[]>()
const userBySocket = new Map<WS, number>()
const onOpenCallbacks: ((userId: number, wsc: WS) => void)[] = []
const messageRouter = new WebSocketMessageRouter()
// Initialize RPC handlers
messageRouter.initializeRPCHandlers()

function enrichWSC(wsc: WSContext): WS {
  ;(wsc as WS).createdAt = Date.now()
  return wsc as WS
}

export const websockets = {
  getAll() {
    return all
  },
  getAllCount() {
    return all.length
  },
  getByUserCount(userId: number) {
    return (socketsByUser.get(userId) ?? []).length
  },
  onOpen: (callback: (userId: number, wsc: WS) => void) => {
    onOpenCallbacks.push(callback)
  },
  opened(userId: number, wsc: WSContext) {
    const ws = enrichWSC(wsc)
    ws.createdAt = Date.now()
    all.push(ws)
    userBySocket.set(ws, userId)
    const sockets = socketsByUser.get(userId) ?? []
    sockets.push(ws)
    socketsByUser.set(userId, sockets)
    log(
      "Connection opened",
      `User #${userId} has ${sockets.length} websocket(s)`,
    )
    websockets.send(
      {
        ws,
        message: {
          e: "server",
          t: "message",
          p: [
            `Hello from server! You have ${sockets.length} websocket(s)`,
          ],
        },
      },
    )
    // Set up a heartbeat interval
    ws.heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        websockets.send({
          ws,
          message: {
            e: "server",
            t: "ping",
          },
        })
      }
    }, 30000) // 30 second interval

    for (const userWs of sockets) {
      if (userWs !== ws) {
        websockets.send({
          ws: userWs,
          message: {
            e: "server",
            t: "message",
            p: [
              `Another websocket has connected. You have ${sockets.length} websocket(s)`,
            ],
          },
        })
      }
    }

    for (const callback of onOpenCallbacks) {
      callback(userId, ws)
    }
  },
  onMessage: async (wsc: WSContext, event: MessageEvent) => {
    const ws = wsc as WS
    const json = JSON.parse(event.data)

    const userId = userBySocket.get(ws)
    if (!userId) {
      console.error("No userId found for websocket, cannot process message")
      return
    }

    // Try to handle as RPC message first, then fall back to legacy format
    const handled = await messageRouter.routeMessage(ws, json, userId)

    if (!handled) {
      console.warn(`No handler found for message:`, json)
      // Send error response for unhandled messages
      ws.send(JSON.stringify({
        success: false,
        error: {
          code: "UNSUPPORTED_MESSAGE",
          message: "Unsupported message format",
          details: { receivedMessage: json },
        },
      }))
    }
  },
  closed(wsc: WSContext) {
    const ws = wsc as WS
    clearInterval(ws.heartbeatInterval)
    log(
      `Connection closed. Was alive for ${Date.now() - ws.createdAt}ms`,
    )
    const index = all.indexOf(ws)
    if (index !== -1) {
      all.splice(index, 1)
    }
    const userId = userBySocket.get(ws)
    userBySocket.delete(ws)
    if (userId) {
      const sockets = socketsByUser.get(userId) ?? []
      const index = sockets.indexOf(ws)
      if (index !== -1) {
        sockets.splice(index, 1)
        socketsByUser.set(userId, sockets)
        for (const userWs of sockets) {
          if (userWs !== ws) {
            websockets.send({
              ws: userWs,
              message: {
                e: "server",
                t: "message",
                p: [
                  `One of your websockets disconnected. You have ${sockets.length} websocket(s)`,
                ],
              },
            })
          }
        }
      }
    }
  },
  send(params: { ws?: WS; userId?: number; message: WebSocketMessage }) {
    if (params.ws) {
      if (params.ws.readyState !== WebSocket.OPEN) {
        return
      }
      params.ws.send(JSON.stringify(params.message))
      return
    }
    if (params.userId) {
      const wss = socketsByUser.get(params.userId) ?? []
      for (const ws of wss) {
        if (ws.readyState !== WebSocket.OPEN) {
          continue
        }
        ws.send(JSON.stringify(params.message))
      }
    } else {
      for (const ws of all) {
        if (ws.readyState !== WebSocket.OPEN) {
          continue
        }
        ws.send(JSON.stringify(params.message))
      }
    }
  },
  sendToAll(message: WebSocketMessage) {
    for (const ws of all) {
      this.send({ ws, message })
    }
  },
  onModelChange(
    model: SyncModelName,
    p: SyncModel[],
    t: string,
    acknowledgmentId?: string,
  ) {
    for (const ws of all) {
      // TODO: right now we send all changes to all websockets, but we could optimize this
      // by sending only to websockets of the user that owns the model
      websockets.send({
        ws,
        message: { e: model, t, p, id: acknowledgmentId },
      })
    }
  },
  syncData: async (ws: WS, lastSyncAt: number) => {
    const userId = userBySocket.get(ws)
    if (!userId) {
      console.error("No userId found for websocket, cannot sync data")
      return
    }
    await db.syncData(
      (model, data) => {
        websockets.send({
          ws,
          message: { e: model, t: "list", p: data },
        })
      },
      userId,
      lastSyncAt,
    )
    const newSyncAt = Date.now()
    websockets.send({
      ws,
      message: { e: "sync", t: "finished", p: [newSyncAt] },
    })
  },
}
