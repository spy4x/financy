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
  UserAuthenticationFailed,
  UserSignedIn,
  UserSignedOut,
  UserSignedUp,
  WSConnected,
} from "../cqrs/events.ts"
import { checkAuthStatus } from "../services/auth-checker.ts"

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

    socket.value.onclose = async (event) => {
      const wasNeverConnected = !connectedAt.value
      const abnormalClosure = event && event.code === 1006
      // If never connected and abnormal closure, check auth status before assuming auth failure
      if (wasNeverConnected && abnormalClosure) {
        console.warn("WebSocket closed abnormally on first connection, checking auth status...")
        const authCheck = await checkAuthStatus()
        if (!authCheck.isAuthenticated) {
          console.warn("Auth check confirmed user is not authenticated (401)")
          status.value = WSStatus.DISCONNECTED
          eventBus.emit(new UserAuthenticationFailed())
          // Do not attempt to reconnect
          return
        } else {
          console.log("Auth check confirmed user is still authenticated, treating as network issue")
          // Continue with normal reconnection logic
        }
      }
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
      // Let onclose handle abnormal closure/auth errors
      console.error("WebSocket error:", error)
      // Only disconnect and reconnect if not in auth error case
      if (status.value !== WSStatus.DISCONNECTED) {
        ws.disconnect(true)
      }
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
      eventBus.emit(new WSConnected())
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
        ws.request({ message: { e: "client", t: WebSocketMessageType.PONG } })
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
        ws.request({ message: { e: "client", t: WebSocketMessageType.PING } })
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

    // Create an enhanced reconnect function that checks auth status
    const reconnectWithAuthCheck = async () => {
      // Periodically check auth status during reconnection attempts
      const authCheck = await checkAuthStatus()
      if (!authCheck.isAuthenticated) {
        console.warn(
          "Auth check during reconnection shows user is not authenticated, stopping reconnection",
        )
        clearInterval(reconnectIntervalTimer.value)
        reconnectIntervalTimer.value = 0
        reconnectOp.value = op()
        eventBus.emit(new UserAuthenticationFailed())
        return
      }
      ws.connect()
    }

    reconnectIntervalTimer.value = setInterval(reconnectWithAuthCheck, RETRY_INTERVAL)
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
    ws.request({ message: { e: "sync", t: WebSocketMessageType.SYNC_START, p: [syncedAt.value] } })
  },

  request: (params: {
    message: WebSocketMessage
    params?: AcknowledgementParams
    callback?: AcknowledgementCallback
  }): string => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
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
    socket.value.send(JSON.stringify({ ...params.message, id }))
    return id
  },

  onMessage: (callback: (message: WebSocketMessage) => void): () => void => {
    onMessageListeners.add(callback)
    return () => {
      onMessageListeners.delete(callback)
    }
  },
}
