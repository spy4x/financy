import { Hono } from "hono"
import { APIContext } from "../_types.ts"
import { webPushService } from "@api/services"

export const pushNotificationRoute = new Hono<APIContext>()
  .get(`/public-key`, async (c) => {
    const publicKey = await webPushService.getPublicKey()
    return c.json({ publicKey })
  })
  .get(`/devices`, async (c) => {
    const userId = c.get("auth").user.id
    const deviceList = await webPushService.deviceList(userId)
    return c.json({ data: deviceList })
  })
  .post(`/`, async (c) => {
    const userId = c.get("auth").user.id
    const { subscription, deviceId } = await c.req.json()
    const userPushToken = await webPushService.subscribe(
      subscription,
      deviceId,
      userId,
    )
    return c.json({ userPushToken })
  })
  .delete("/", async (c) => {
    const userId = c.get("auth").user.id
    const { deviceId } = await c.req.json()
    await webPushService.unsubscribe(deviceId, userId)
    return c.json({ isSuccess: true })
  })
