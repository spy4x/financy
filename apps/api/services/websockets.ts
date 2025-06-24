import { WSContext } from "hono/ws"
import type { SyncModel, WebSocketMessage } from "@shared/types"
import {
  accountBaseSchema,
  accountUpdateSchema,
  categoryBaseSchema,
  categoryUpdateSchema,
  groupBaseSchema,
  GroupRole,
  GroupRoleUtils,
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
  GroupCreateCommand,
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionUpdateCommand,
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
        // Verify legitimacy of the category
        if (await db.category.verifyLegitimacy(category, userId) === false) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Category is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const created = await db.category.createOne({ data: category })
        websockets.onModelChange(
          SyncModelName.category,
          [created],
          WebSocketMessageType.CREATED,
          acknowledgmentId,
        )
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
        const existingCategory = await db.category.findOne({ id: update.id })
        if (!existingCategory) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Category not found"],
              id: acknowledgmentId,
            },
          })
          return
        }
        // Verify legitimacy of the category
        if (
          await db.category.verifyLegitimacy({
            ...existingCategory,
            ...update,
          }, userId) === false
        ) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Category is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const updated = await db.category.updateOne({
          id: update.id,
          data: update,
        })
        websockets.onModelChange(
          SyncModelName.category,
          [updated],
          WebSocketMessageType.UPDATED,
          acknowledgmentId,
        )
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
        if (await db.category.verifyLegitimacyById(id, userId) === false) {
          websockets.send({
            ws,
            message: {
              e: "category",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Category is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const deleted = await db.category.deleteOne({ id })
        websockets.onModelChange(
          SyncModelName.category,
          [deleted],
          WebSocketMessageType.DELETED,
          acknowledgmentId,
        )
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

        const existingGroup = await db.group.findOne({ id: update.id })
        if (!existingGroup) {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Group not found"],
              id: acknowledgmentId,
            },
          })
          return
        } // Check if user has admin/owner access to this group
        const membership = await db.groupMembership.findByUserAndGroup(userId, update.id)
        console.log(
          `Group update permission check: userId=${userId}, groupId=${update.id}, membership=`,
          membership,
        )
        if (!membership || !GroupRoleUtils.canManage(membership.role)) { // Admin or Owner required
          console.warn(
            `User ${userId} lacks permissions to update group ${update.id}. Membership role: ${
              membership?.role || "none"
            }`,
          )
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Insufficient permissions to update group"],
              id: acknowledgmentId,
            },
          })
          return
        }

        const updated = await db.group.updateOne({
          id: update.id,
          data: update,
        })
        websockets.onModelChange(
          SyncModelName.group,
          [updated],
          WebSocketMessageType.UPDATED,
          acknowledgmentId,
        )
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

        const existingGroup = await db.group.findOne({ id })
        if (!existingGroup) {
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Group not found"],
              id: acknowledgmentId,
            },
          })
          return
        }

        // Check if user has owner access to this group
        const membership = await db.groupMembership.findByUserAndGroup(userId, id)
        if (!membership || !GroupRoleUtils.canDelete(membership.role)) { // Only Owner can delete
          websockets.send({
            ws,
            message: {
              e: "group",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Only group owners can delete groups"],
              id: acknowledgmentId,
            },
          })
          return
        }

        const deleted = await db.group.deleteOne({ id })
        websockets.onModelChange(
          SyncModelName.group,
          [deleted],
          WebSocketMessageType.DELETED,
          acknowledgmentId,
        )
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
        // Verify legitimacy of the account
        if (await db.account.verifyLegitimacy(account, userId) === false) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Account is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const created = await db.account.createOne({ data: account })
        websockets.onModelChange(
          SyncModelName.account,
          [created],
          WebSocketMessageType.CREATED,
          acknowledgmentId,
        )
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
        const existingAccount = await db.account.findOne({ id: update.id })
        if (!existingAccount) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Account not found"],
              id: acknowledgmentId,
            },
          })
          return
        }
        // Verify legitimacy of the account
        if (
          await db.account.verifyLegitimacy({
            ...existingAccount,
            ...update,
          }, userId) === false
        ) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Account is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const updated = await db.account.updateOne({
          id: update.id,
          data: update,
        })
        websockets.onModelChange(
          SyncModelName.account,
          [updated],
          WebSocketMessageType.UPDATED,
          acknowledgmentId,
        )
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
        // Check if the account exists and user has access
        const existingAccount = await db.account.findOne({ id })
        if (!existingAccount) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Account not found"],
              id: acknowledgmentId,
            },
          })
          return
        }
        if (await db.account.verifyLegitimacy(existingAccount, userId) === false) {
          websockets.send({
            ws,
            message: {
              e: "account",
              t: WebSocketMessageType.ERROR_VALIDATION,
              p: ["Account is not legitimate"],
              id: acknowledgmentId,
            },
          })
          return
        }
        const deleted = await db.account.deleteOne({ id })
        websockets.onModelChange(
          SyncModelName.account,
          [deleted],
          WebSocketMessageType.DELETED,
          acknowledgmentId,
        )
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
        const updatedUser = await db.user.updateOne({
          id: userId,
          data: userData,
        })
        websockets.onModelChange(
          SyncModelName.user,
          [updatedUser],
          WebSocketMessageType.UPDATED,
          acknoledgmentId ?? undefined,
        )
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
