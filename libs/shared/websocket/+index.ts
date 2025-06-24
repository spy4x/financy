import { RPC, RPCPing, rpcReqSchema, rpcResSchema, RPCTimeoutError, validate } from "@shared/types"
import { getRandomString } from "@shared/helpers/random.ts"

export interface WSLike {
  readyState: number
  send(data: string | ArrayBuffer | Uint8Array): void
  onMessage(event: MessageEvent<any>, ws: WSLike): void
  disconnect(): void
}

type ReqParams = {
  multupleResponsesExpected?: boolean
  timeoutMs?: number
}
type AcknowledgementCallback<T extends RPC> = (res: T["res"], unsubscribe: () => void) => void

export class RPCWebsocket {
  responses = new Map<string, {
    params: ReqParams
    callback: AcknowledgementCallback<any>
  }>()
  rpcHandlers = new Map<string, (req: RPC["req"]) => RPC["res"]>()

  constructor(public ws: WSLike) {
    this.addHandler<RPCPing>(
      {
        req: { name: "system.ping", reqId: getRandomString(10) },
        res: { reqId: getRandomString(10), data: "system.pong" },
      },
      (req) => {
        // // Check if it's RPCPing
        // const rpcPingReq = rpcPingSchema.get("req")
        // // handle ping inline here for now
        // const rpcPingReqParse = validate(rpcPingReq, rpcReq)
        // if (rpcPingReqParse.data) {
        //     console.log("Received RPC Ping, sending Pong")
        //     this.res<RPCPing>({
        //     reqId: rpcPingReqParse.data.reqId,
        //     data: "system.pong",
        //     })
        //     return true
        // }
        return { data: "system.pong", reqId: req.reqId }
      },
    )
  }

  /**
   * Uses RPCReq to send a request to the server and expects an RPCRes in return.
   */
  req<T extends RPC>(params: {
    rpc: T["req"]
    params?: ReqParams
    callback?: AcknowledgementCallback<T>
  }): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error("Socket is not connected")
      return
    }
    if (params.callback) {
      const timeoutMs = params.params?.timeoutMs ?? 5000
      this.responses.set(params.rpc.reqId, {
        params: {
          multupleResponsesExpected: params.params?.multupleResponsesExpected ?? false,
          timeoutMs,
        },
        callback: params.callback,
      })
      // handle timeout
      if (timeoutMs > 0) {
        setTimeout(() => {
          const response = this.responses.get(params.rpc.reqId)
          if (response) {
            response.callback(
              { reqId: params.rpc.reqId, error: "timeout" } satisfies RPCTimeoutError,
              () => {},
            )
            this.responses.delete(params.rpc.reqId)
            console.warn(`Request ${params.rpc.reqId} timed out after ${timeoutMs}ms`)
          }
        }, timeoutMs)
      }
    }
    this.ws.send(JSON.stringify({ ...params.rpc }))
  }

  res<T extends RPC>(res: T["res"]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("Socket is not connected")
      return
    }
    this.ws.send(JSON.stringify(res))
  }

  addHandler<T extends RPC>(
    rpcSchema: typeof rpcSchema,
    handler: (req: T["req"]) => T["res"],
  ): void {
    if (this.rpcHandlers.has(rpc.req.name)) {
      throw new Error(`Handler for ${rpc.req.name} already exists`)
    }
    this.rpcHandlers.set(rpc.req.name, handler)
  }

  /**
   * Parses the incoming WebSocket message and routes it as RPCReq or RPCRes.
   * Returns true if the message was handled, false otherwise.
   * @param event
   * @param ws
   * @returns
   */
  onMessage(event: MessageEvent<any>, ws: WSLike): boolean {
    console.log("Message from server:", event.data)
    const json = JSON.parse(event.data)

    // RPC parsing and validation
    const parseRPCReq = validate(rpcReqSchema, json)
    if (parseRPCReq.error) {
      console.log("Not a valid RPCReq, skipping, maybe RPCRes", {
        data: json,
        error: parseRPCReq.error,
      })
    } else {
      // Handle RPCReq call
      const rpcReq = parseRPCReq.data

      // find proper handler
      const handler = this.rpcHandlers.get(rpcReq.name)
      if (handler) {
        console.log("Handling RPCReq", rpcReq.name)
        const res = handler(rpcReq)
        this.res(res)
        return true
      } else {
        console.error("No handler found for RPCReq", rpcReq.name)
        return false
      }
    }

    const parseRPCRes = validate(rpcResSchema, json)
    if (parseRPCRes.error) {
      // skip to handle legacy WS messages for now
      // TODO: remove this after RPC is fully implemented
      console.log("Not a valid RPCRes, skipping, maybe legacy WS message")
    } else {
      // Handle RPCRes call
      const rpcRes = parseRPCRes.data
      const acknowledge = this.responses.get(rpcRes.reqId)
      if (acknowledge) {
        acknowledge.callback(rpcRes, () => this.responses.delete(rpcRes.reqId))
        if (!acknowledge.params.multupleResponsesExpected) {
          this.responses.delete(rpcRes.reqId)
        }
      }
      return false
    }
    return false
  }

  startHeartbeat(intervalMs: number, pongTimeoutMs: number): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error("Socket is not connected")
      return
    }
    setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) return
      this.req<RPCPing>({
        rpc: { reqId: getRandomString(10), name: "system.ping" },
        params: { timeoutMs: pongTimeoutMs },
        callback: (res) => {
          if (res.error === "timeout") {
            console.error("Ping request timed out. Disconnecting...")
            this.ws.disconnect()
          } else if (res.data !== "system.pong") {
            console.error("Received unexpected ping response:", res)
          } else {
            console.log("Received pong from server")
          }
        },
      })
    }, intervalMs)
  }
}
