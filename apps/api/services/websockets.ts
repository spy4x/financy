import { WSContext } from "hono/ws"

import {
  SyncModel,
  SyncModelName,
  validate,
  WebSocketMessage,
  webSocketMessageSchema,
  WebSocketMessageType,
} from "@shared/types"

import { db } from "./db.ts"
import { log } from "./log.ts"

export type WS = WSContext & { createdAt: number; heartbeatInterval: number }

const all: WS[] = []
const socketsByUser = new Map<number, WS[]>()
const userBySocket = new Map<WS, number>()
const onOpenCallbacks: ((userId: number, wsc: WS) => void)[] = []

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
          t: WebSocketMessageType.MESSAGE,
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
            t: WebSocketMessageType.PING,
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
            t: WebSocketMessageType.MESSAGE,
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
    log(`Message from client: ${event}`)
    const json = JSON.parse(event.data)
    const parseResult = validate(webSocketMessageSchema, json)
    if (parseResult.error) {
      console.error("Invalid message", { issues: parseResult.error, json })
      return
    }
    if (
      parseResult.data.e === "client" &&
      parseResult.data.t === WebSocketMessageType.PING
    ) {
      websockets.send({
        ws,
        message: {
          e: "server",
          t: WebSocketMessageType.PONG,
        },
      })
    }
    if (
      parseResult.data.e === "sync" &&
      parseResult.data.t === WebSocketMessageType.SYNC_START &&
      parseResult.data.p && parseResult.data.p.length > 0
    ) {
      await websockets.syncData(ws, parseResult.data.p[0] as number)
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
                t: WebSocketMessageType.MESSAGE,
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
  onModelChange(model: SyncModelName, p: SyncModel[], t: WebSocketMessageType) {
    for (const ws of all) {
      websockets.send({ ws, message: { e: model, t, p } })
    }
  },
  syncData: async (ws: WS, lastSyncAt: number) => {
    await db.syncData((model, data) => {
      websockets.send({
        ws,
        message: { e: model, t: WebSocketMessageType.LIST, p: data },
      })
    }, lastSyncAt)
    const newSyncAt = Date.now()
    websockets.send({
      ws,
      message: { e: "sync", t: WebSocketMessageType.SYNC_FINISHED, p: [newSyncAt] },
    })
  },
}
