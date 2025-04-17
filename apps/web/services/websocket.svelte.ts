import {
  getOperationState,
  OperationState,
  validate,
  WebSocketMessage,
  webSocketMessageSchema,
  WebSocketMessageType,
  WSStatus,
} from "@shared/types"
import { sleep } from "@shared/helpers/async"

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

let status = $state<WSStatus>(WSStatus.DISCONNECTED)
let socket = $state<null | WebSocket>(null)
let connectedAt = $state(0)
let syncedAt = $state(0)
let pongCheckTimer = $state(0)
let reconnectIntervalTimer = $state(0)
let heartbeatTimer = $state(0)
let reconnectOp = $state<OperationState<void>>(getOperationState())
let syncOp = $state<OperationState<void>>(getOperationState())
const onMessageListeners = new Set<
  (message: WebSocketMessage) => void
>()

export const websocket = {
  get status(): WSStatus {
    return status
  },
  get reconnectOp(): OperationState<void> {
    return reconnectOp
  },
  get syncOp(): OperationState<void> {
    return syncOp
  },

  init: (): Promise<void> => websocket.connect(),
  connect: async (): Promise<void> => {
    if (status === WSStatus.CONNECTING) {
      return
    }
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    const address = `${protocol}://${window.location.host}/api/ws`
    console.log("Connecting WS to", address)
    status = WSStatus.CONNECTING
    if (reconnectOp.inProgress) {
      await sleep(1000)
    }
    setTimeout(() => {
      if (socket && socket.readyState !== WebSocket.OPEN) {
        console.log("Connection attempt took too long, retrying...")
        websocket.disconnect(true)
      }
    }, CONNECTING_ATTEMPT_TIMEOUT)

    socket = new WebSocket(address)

    socket.onclose = () => {
      console.log(
        `Disconnected from server. ${
          connectedAt ? `Was alive for ${Date.now() - connectedAt}ms` : `Never connected`
        }`,
      )
      connectedAt = 0
      status = WSStatus.DISCONNECTED
      websocket.reconnect()
    }

    socket.onerror = (error) => {
      console.error("WebSocket error:", error)
      websocket.disconnect(true)
    }

    socket.onopen = () => {
      console.log("Connected to server")
      clearInterval(reconnectIntervalTimer)
      clearInterval(heartbeatTimer)
      status = WSStatus.CONNECTED
      connectedAt = Date.now()
      reconnectIntervalTimer = 0
      heartbeatTimer = 0
      reconnectOp = getOperationState()
      // Optional: Implement ping for keep-alive - Ping every X seconds and expect a pong within Y seconds, otherwise close the connection
      websocket.setHeartBeat()
      websocket.sync()
    }

    socket.onmessage = (event) => {
      // console.log("Message from server:", event.data)
      const json = JSON.parse(event.data)

      const parseResult = validate(webSocketMessageSchema, json)
      if (parseResult.error) {
        console.error("Invalid message", parseResult.error)
        return
      }
      const message = parseResult.data
      if (message.e === "server" && message.t === WebSocketMessageType.PONG) {
        clearTimeout(pongCheckTimer)
        pongCheckTimer = 0
      }
      if (
        message.e === "server" &&
        message.t === WebSocketMessageType.PING
      ) {
        socket && websocket.send({
          ws: socket,
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
        syncOp = getOperationState()
      }

      console.log(`Message:`, message)
      for (const listener of onMessageListeners) {
        listener(message)
      }

      syncedAt = Date.now()
    }
  },

  setHeartBeat: () => {
    heartbeatTimer = setInterval(
      () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return
        websocket.send({
          ws: socket,
          message: { e: "client", t: WebSocketMessageType.PING },
        })
        // Set up a pong timeout
        pongCheckTimer = setTimeout(() => {
          if (socket) {
            console.error(
              "Did not receive pong. Current socket state:",
              socket.readyState,
              "Closing socket...",
            )
            websocket.disconnect(true)
          } else {
            console.error("Did not receive pong, socket is null")
          }
        }, PONG_TIMEOUT)
      },
      PING_INTERVAL,
    )
  },

  disconnect: (shouldReconnect = false): void => {
    if (socket) {
      console.log("Disconnecting WS")
      socket.close()
      socket = null
      reconnectOp = getOperationState()
    }
    if (shouldReconnect) {
      websocket.reconnect()
    }
  },

  reconnect: (): void => {
    if (reconnectOp.inProgress) return
    clearInterval(heartbeatTimer)
    clearInterval(reconnectIntervalTimer)
    reconnectOp = getOperationState(true)
    heartbeatTimer = 0
    reconnectIntervalTimer = 0
    // Attempt to reconnect only if the closure was not clean
    console.log("Attempting to reconnect every...", { RETRY_INTERVAL })
    reconnectIntervalTimer = setInterval(websocket.connect, RETRY_INTERVAL)
  },

  send: (params: { ws: WebSocket; message: WebSocketMessage }): void => {
    if (params.ws.readyState === WebSocket.OPEN) {
      params.ws.send(JSON.stringify(params.message))
    }
  },

  sync: (): void => {
    if (!socket) {
      console.error("Socket is not connected")
      return
    }
    if (syncOp.inProgress) {
      return
    }
    syncOp = getOperationState(true)
    websocket.send({
      ws: socket,
      message: { e: "sync", t: WebSocketMessageType.SYNC_START, p: [syncedAt] },
    })
  },

  request: (params: {
    message: WebSocketMessage
    params?: AcknowledgementParams
    callback?: AcknowledgementCallback
  }): string => {
    if (!socket) {
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
    websocket.send({ ws: socket, message: { ...params.message, id } })
    return id
  },
}
