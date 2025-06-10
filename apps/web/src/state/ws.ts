import {
  op,
  OperationState,
  validate,
  WebSocketMessage,
  webSocketMessageSchema,
  WebSocketMessageType,
  WSStatus,
} from "@shared/types"
import { signal } from "@preact/signals"
import { sleep } from "@shared/helpers/async.ts"
import { eventBus } from "../services/eventBus.ts"
import {
  UserAuthenticatedOnAppStart,
  UserSignedIn,
  UserSignedOut,
  UserSignedUp,
} from "../cqrs/events.ts"

const RETRY_INTERVAL = 1500 + Math.random() * 2000 // Retry interval in milliseconds
const PING_INTERVAL = 15000 // Ping interval
const PONG_TIMEOUT = 7500 // Timeout for pong
const CONNECTING_ATTEMPT_TIMEOUT = 7500 // Timeout for connection attempt
type AcknowledgementParams = {
  isSingle?: boolean
  timeoutMs?: number
}
type AcknowledgementCallback = (params: { message: WebSocketMessage }) => void
const acknowledges = new Map<
  string,
  {
    params: AcknowledgementParams
    callback: AcknowledgementCallback
  }
>()

const status = signal<WSStatus>(WSStatus.DISCONNECTED)
const socket = signal<null | WebSocket>(null)
const connectedAt = signal(0)
const syncedAt = signal(0)
const pongCheckTimer = signal(0)
const reconnectIntervalTimer = signal(0)
const heartbeatTimer = signal(0)
const reconnectOp = signal<OperationState<void>>(op())
const syncOp = signal<OperationState<void>>(op())
const onMessageListeners = new Set<
  (message: WebSocketMessage) => void
>()

export const ws = {
  status,
  reconnectOp,
  syncOp,

  init: () => {
    eventBus.on(UserAuthenticatedOnAppStart, () => ws.connect())
    eventBus.on(UserSignedIn, () => ws.connect())
    eventBus.on(UserSignedUp, () => ws.connect())
    eventBus.on(UserSignedOut, () => ws.disconnect())
  },
  connect: async (): Promise<void> => {
    // if (!IS_BROWSER) return
    if (status.value === WSStatus.CONNECTING) {
      return
    }
    if (
      socket.value &&
      (socket.value.readyState === WebSocket.OPEN ||
        socket.value.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    const protocol = globalThis.location.protocol === "https:" ? "wss" : "ws"
    const address = `${protocol}://${globalThis.location.host}/api/ws`
    console.log("Connecting WS to", address)
    status.value = WSStatus.CONNECTING
    if (reconnectOp.value.inProgress) {
      await sleep(1000)
    }
    setTimeout(() => {
      if (socket.value && socket.value.readyState !== WebSocket.OPEN) {
        console.log("Connection attempt took too long, retrying...")
        ws.disconnect(true)
      }
    }, CONNECTING_ATTEMPT_TIMEOUT)

    socket.value = new WebSocket(address)

    socket.value.onclose = () => {
      console.log(
        `Disconnected from server. ${
          connectedAt.value
            ? `Was alive for ${Date.now() - connectedAt.value}ms`
            : `Never connected`
        }`,
      )
      connectedAt.value = 0
      status.value = WSStatus.DISCONNECTED
      ws.reconnect()
    }

    socket.value.onerror = (error) => {
      console.error("WebSocket error:", error)
      ws.disconnect(true)
    }

    socket.value.onopen = () => {
      console.log("Connected to server")
      clearInterval(reconnectIntervalTimer.value)
      clearInterval(heartbeatTimer.value)
      status.value = WSStatus.CONNECTED
      connectedAt.value = Date.now()
      reconnectIntervalTimer.value = 0
      heartbeatTimer.value = 0
      reconnectOp.value = op()
      // Optional: Implement ping for keep-alive - Ping every X seconds and expect a pong within Y seconds, otherwise close the connection
      ws.setHeartBeat()
      ws.sync()
    }

    socket.value.onmessage = (event) => {
      // console.log("Message from server:", event.data)
      const json = JSON.parse(event.data)

      const parseResult = validate(webSocketMessageSchema, json)
      if (parseResult.error) {
        console.error("Invalid message", parseResult.error)
        return
      }
      const message = parseResult.data
      if (message.e === "server" && message.t === WebSocketMessageType.PONG) {
        clearTimeout(pongCheckTimer.value)
        pongCheckTimer.value = 0
      }
      if (
        message.e === "server" &&
        message.t === WebSocketMessageType.PING
      ) {
        socket.value && ws.send({
          ws: socket.value,
          message: { e: "client", t: WebSocketMessageType.PONG },
        })
      }
      // handle acknowledgement
      if (message.id) {
        const acknowledge = acknowledges.get(message.id)
        if (acknowledge) {
          acknowledge.callback({ message })
          if (acknowledge.params.isSingle) {
            acknowledges.delete(message.id)
          }
        }
      }

      if (message.e === "sync" && message.t === WebSocketMessageType.SYNC_FINISHED) {
        syncOp.value = op()
      }

      if (
        !(message.e === "server" &&
          (message.t === WebSocketMessageType.PING || message.t === WebSocketMessageType.PONG))
      ) {
        console.log(`Message:`, message)
      }
      for (const listener of onMessageListeners) {
        listener(message)
      }

      syncedAt.value = Date.now()
    }
  },

  setHeartBeat: () => {
    heartbeatTimer.value = setInterval(
      () => {
        if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return
        ws.send({
          ws: socket.value,
          message: { e: "client", t: WebSocketMessageType.PING },
        })
        // Set up a pong timeout
        pongCheckTimer.value = setTimeout(() => {
          if (socket.value) {
            console.error(
              "Did not receive pong. Current socket state:",
              socket.value.readyState,
              "Closing socket...",
            )
            ws.disconnect(true)
          } else {
            console.error("Did not receive pong, socket is null")
          }
        }, PONG_TIMEOUT)
      },
      PING_INTERVAL,
    )
  },

  disconnect: (shouldReconnect = false): void => {
    if (socket.value) {
      console.log("Disconnecting WS")
      socket.value.close()
      socket.value = null
      reconnectOp.value = op()
    }
    if (shouldReconnect) {
      ws.reconnect()
    }
  },

  reconnect: (): void => {
    if (reconnectOp.value.inProgress) return
    clearInterval(heartbeatTimer.value)
    clearInterval(reconnectIntervalTimer.value)
    reconnectOp.value = op(true)
    heartbeatTimer.value = 0
    reconnectIntervalTimer.value = 0
    // Attempt to reconnect only if the closure was not clean
    console.log("Attempting to reconnect every...", { RETRY_INTERVAL })
    reconnectIntervalTimer.value = setInterval(ws.connect, RETRY_INTERVAL)
  },

  send: (params: { ws: WebSocket; message: WebSocketMessage }): void => {
    if (params.ws.readyState === WebSocket.OPEN) {
      params.ws.send(JSON.stringify(params.message))
    }
  },

  sync: (): void => {
    if (!socket.value) {
      console.error("Socket is not connected")
      return
    }
    if (syncOp.value.inProgress) {
      return
    }
    syncOp.value = op(true)
    ws.send({
      ws: socket.value,
      message: { e: "sync", t: WebSocketMessageType.SYNC_START, p: [syncedAt.value] },
    })
  },

  request: (params: {
    message: WebSocketMessage
    params?: AcknowledgementParams
    callback?: AcknowledgementCallback
  }): string => {
    if (!socket.value) {
      console.error("Socket is not connected")
      return ""
    }
    let id = ""
    if (params.callback) {
      id = Math.random().toString(36).substr(2, 9)
      acknowledges.set(id, {
        params: {
          isSingle: params.params?.isSingle ?? true,
          timeoutMs: params.params?.timeoutMs || 5000,
        },
        callback: params.callback,
      })
    }
    ws.send({ ws: socket.value, message: { ...params.message, id } })
    return id
  },

  onMessage: (callback: (message: WebSocketMessage) => void): () => void => {
    onMessageListeners.add(callback)
    return () => {
      onMessageListeners.delete(callback)
    }
  },
}
