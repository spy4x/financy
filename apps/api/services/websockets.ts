import { WSContext } from "hono/ws"
import type { SyncModel, WebSocketMessage } from "@shared/types"
import {
  accountBaseSchema,
  accountUpdateSchema,
  categoryBaseSchema,
  categoryUpdateSchema,
  groupBaseSchema,
  GroupRole,
  groupUpdateSchema,
  SyncModelName,
  transactionBaseSchema,
  transactionUpdateSchema,
  userSchema,
  validate,
  webSocketMessageSchema,
  WebSocketMessageType,
} from "@shared/types"

import { db } from "./db.ts"
import { log } from "./log.ts"
import { commandBus } from "./commandBus.ts"
import {
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountUndeleteCommand,
  AccountUpdateCommand,
  CategoryCreateCommand,
  CategoryDeleteCommand,
  CategoryUndeleteCommand,
  CategoryUpdateCommand,
  GroupCreateCommand,
  GroupDeleteCommand,
  GroupUndeleteCommand,
  GroupUpdateCommand,
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionUndeleteCommand,
  TransactionUpdateCommand,
  UserUpdateCommand,
} from "@api/cqrs/commands.ts"

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
    const json = JSON.parse(event.data)
    const parseResult = validate(webSocketMessageSchema, json)
    if (parseResult.error) {
      console.error("Invalid message", { issues: parseResult.error, json })
      return
    }

    const acknoledgmentId = parseResult.data.id
    const userId = userBySocket.get(ws)
    if (!userId) {
      console.error("No userId found for websocket, cannot process message")
      return
    }

    if (
      !(parseResult.data.e === "client" && (
        parseResult.data.t === WebSocketMessageType.PING ||
        parseResult.data.t === WebSocketMessageType.PONG
      ))
    ) {
      log(`Received message from ${parseResult.data.e}:`, parseResult.data)
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

    if (parseResult.data.e === "transaction") {
      const acknowledgmentId = parseResult.data.id
      const payload = parseResult.data.p?.[0]

      if (parseResult.data.t === WebSocketMessageType.CREATE) {
        // Validate with transactionBaseSchema for CREATE
        const validation = validate(transactionBaseSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid transaction data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const tx = validation.data

        // Create the transaction using CQRS command
        try {
          await commandBus.execute(
            new TransactionCreateCommand({
              transaction: tx,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to create transaction:", error)
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to create transaction"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UPDATE) {
        // Validate with transactionUpdateSchema for UPDATE
        const validation = validate(transactionUpdateSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid transaction data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const tx = validation.data

        // Update the transaction using CQRS command
        try {
          const { id, ...updates } = tx
          await commandBus.execute(
            new TransactionUpdateCommand({
              transactionId: id,
              updates,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to update transaction:", error)
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to update transaction"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.DELETE) {
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid payload: missing or invalid 'id'"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Delete the transaction using CQRS command
        try {
          await commandBus.execute(
            new TransactionDeleteCommand({
              transactionId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to delete transaction:", error)
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to delete transaction"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UNDELETE) {
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid payload: missing or invalid 'id'"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Undelete the transaction using CQRS command
        try {
          await commandBus.execute(
            new TransactionUndeleteCommand({
              transactionId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to undelete transaction:", error)
          websockets.send({
            ws,
            message: {
              e: "transaction",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to undelete transaction"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else {
        websockets.send({
          ws,
          message: {
            e: "transaction",
            t: WebSocketMessageType.ERROR_VALIDATION,
            p: [`Invalid WebSocketMessageType type "${parseResult.data.t}"`],
            id: acknowledgmentId,
          },
        })
        return
      }
    }

    // category
    if (parseResult.data.e === "category") {
      const acknowledgmentId = parseResult.data.id
      const payload = parseResult.data.p?.[0]

      if (parseResult.data.t === WebSocketMessageType.CREATE) {
        const validation = validate(categoryBaseSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid category data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const category = validation.data

        // Create the category using CQRS command
        try {
          await commandBus.execute(
            new CategoryCreateCommand({
              category,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to create category:", error)
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to create category"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UPDATE) {
        const validation = validate(categoryUpdateSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid category data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const update = validation.data

        // Update the category using CQRS command
        try {
          const { id, ...updates } = update
          await commandBus.execute(
            new CategoryUpdateCommand({
              categoryId: id,
              updates,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to update category:", error)
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to update category"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.DELETE) {
        // For DELETE, validate the payload to get the category object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid payload: missing or invalid 'id'"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Delete the category using CQRS command
        try {
          await commandBus.execute(
            new CategoryDeleteCommand({
              categoryId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to delete category:", error)
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to delete category"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UNDELETE) {
        // For UNDELETE, validate the payload to get the category object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid category ID"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Undelete the category using CQRS command
        try {
          await commandBus.execute(
            new CategoryUndeleteCommand({
              categoryId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to undelete category:", error)
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to undelete category"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else {
        websockets.send({
          ws,
          message: {
            e: "category",
            t: WebSocketMessageType.ERROR_VALIDATION,
            p: [`Invalid WebSocketMessageType type "${parseResult.data.t}"`],
            id: acknowledgmentId,
          },
        })
        return
      }
    }

    // group
    if (parseResult.data.e === "group") {
      const acknowledgmentId = parseResult.data.id
      const payload = parseResult.data.p?.[0]

      if (parseResult.data.t === WebSocketMessageType.CREATE) {
        const validation = validate(groupBaseSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid group data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const group = validation.data
        // Create the group and its membership using the command
        try {
          await commandBus.execute(
            new GroupCreateCommand({
              group,
              userId,
              role: GroupRole.OWNER,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to create group and membership:", error)
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Failed to create group and membership"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UPDATE) {
        const validation = validate(groupUpdateSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid group data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const update = validation.data

        // Update the group using CQRS command
        try {
          const { id, ...updates } = update
          await commandBus.execute(
            new GroupUpdateCommand({
              groupId: id,
              updates,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to update group:", error)
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to update group"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.DELETE) {
        // For DELETE, validate the payload to get the group object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid group ID"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Delete the group using CQRS command
        try {
          await commandBus.execute(
            new GroupDeleteCommand({
              groupId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to delete group:", error)
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to delete group"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UNDELETE) {
        // For UNDELETE, validate the payload to get the group object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid group ID"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Undelete the group using CQRS command
        try {
          await commandBus.execute(
            new GroupUndeleteCommand({
              groupId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to undelete group:", error)
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to undelete group"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else {
        websockets.send({
          ws,
          message: {
            e: "group",
            t: WebSocketMessageType.ERROR_VALIDATION,
            p: [`Invalid WebSocketMessageType type "${parseResult.data.t}"`],
            id: acknowledgmentId,
          },
        })
        return
      }
    }

    // account
    if (parseResult.data.e === "account") {
      const acknowledgmentId = parseResult.data.id
      const payload = parseResult.data.p?.[0]

      if (parseResult.data.t === WebSocketMessageType.CREATE) {
        const validation = validate(accountBaseSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid account data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const account = validation.data

        // Create the account using CQRS command
        try {
          await commandBus.execute(
            new AccountCreateCommand({
              account,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to create account:", error)
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to create account"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UPDATE) {
        const validation = validate(accountUpdateSchema, payload)
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid account data", validation.error],
              id: acknowledgmentId,
            },
          })
          return
        }
        const update = validation.data

        // Update the account using CQRS command
        try {
          const { id, ...updates } = update
          await commandBus.execute(
            new AccountUpdateCommand({
              accountId: id,
              updates,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to update account:", error)
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to update account"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.DELETE) {
        // For DELETE, validate the payload to get the account object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid payload: missing or invalid 'id'"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Delete the account using CQRS command
        try {
          await commandBus.execute(
            new AccountDeleteCommand({
              accountId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to delete account:", error)
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to delete account"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else if (parseResult.data.t === WebSocketMessageType.UNDELETE) {
        // For UNDELETE, validate the payload to get the account object
        let id: number | undefined
        if (
          payload && typeof payload === "object" && "id" in payload &&
          typeof payload.id === "number"
        ) {
          id = payload.id
        } else {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid account ID"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Undelete the account using CQRS command
        try {
          await commandBus.execute(
            new AccountUndeleteCommand({
              accountId: id,
              userId,
              acknowledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to undelete account:", error)
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to undelete account"],
              id: acknowledgmentId,
            },
          })
          return
        }
      } else {
        websockets.send({
          ws,
          message: {
            e: "account",
            t: WebSocketMessageType.ERROR_VALIDATION,
            p: [`Invalid WebSocketMessageType type "${parseResult.data.t}"`],
            id: acknowledgmentId,
          },
        })
        return
      }
    }

    // user
    if (parseResult.data.e === "user") {
      if (parseResult.data.t === WebSocketMessageType.UPDATE) {
        const validation = validate(userSchema, parseResult.data.p?.[0])
        if (validation.error) {
          websockets.send({
            ws,
            message: {
              e: "user",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Invalid user data", validation.error],
              id: acknoledgmentId,
            },
          })
          return
        }
        const userData = validation.data

        // Update the user using CQRS command
        try {
          await commandBus.execute(
            new UserUpdateCommand({
              userId,
              updates: userData,
              acknowledgmentId: acknoledgmentId,
            }),
          )
        } catch (error) {
          console.error("Failed to update user:", error)
          websockets.send({
            ws,
            message: {
              e: "user",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: [error instanceof Error ? error.message : "Failed to update user"],
              id: acknoledgmentId,
            },
          })
          return
        }
      }
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
  onModelChange(
    model: SyncModelName,
    p: SyncModel[],
    t: WebSocketMessageType,
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
          message: { e: model, t: WebSocketMessageType.LIST, p: data },
        })
      },
      userId,
      lastSyncAt,
    )
    const newSyncAt = Date.now()
    websockets.send({
      ws,
      message: { e: "sync", t: WebSocketMessageType.SYNC_FINISHED, p: [newSyncAt] },
    })
  },
}
