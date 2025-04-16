import * as webpush from "webpush"
import { encodeBase64Url } from "@std/encoding"
import { db } from "$api/services/db.ts"
import { config } from "$api/services/config.ts"
import { UserPushToken } from "@shared/types"

type Subscriptions = { [deviceId: string]: webpush.PushSubscriber }

export class WebPushService {
  appServer: webpush.ApplicationServer
  subscriptions: Subscriptions
  publicKey: CryptoKey
  encodedPublicKey: string

  constructor(
    appServer: webpush.ApplicationServer,
    subscriptions: Subscriptions,
    vapidKeys: CryptoKeyPair,
    encodedPublicKey: string,
  ) {
    this.appServer = appServer
    this.subscriptions = subscriptions
    this.publicKey = vapidKeys.publicKey
    this.encodedPublicKey = encodedPublicKey
  }

  static async new() {
    const vapidKeysString = await Deno.readTextFile(config.vapidKeysPath)
    const contactInformation = "mailto:" + config.devEmail
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidKeysString), {
      extractable: false,
    })
    const appServer = await webpush.ApplicationServer.new({
      contactInformation,
      vapidKeys,
    })
    const pushTokens = await db.userPushToken.findAll()
    const subscriptions: Subscriptions = {}
    for (const token of pushTokens) {
      const subscription: webpush.PushSubscription = {
        endpoint: token.endpoint,
        keys: {
          auth: token.auth,
          p256dh: token.p256dh,
        },
      }
      subscriptions[token.deviceId] = appServer.subscribe(subscription)
    }
    return new WebPushService(
      appServer,
      subscriptions,
      vapidKeys,
      encodeBase64Url(
        await crypto.subtle.exportKey(
          "raw",
          vapidKeys.publicKey,
        ),
      ),
    )
  }

  public getPublicKey(): string {
    return this.encodedPublicKey
  }

  public async subscribe(
    subscription: webpush.PushSubscription,
    deviceId: string,
    userId: number,
  ): Promise<Partial<UserPushToken>> {
    this.subscriptions[deviceId] = this.appServer.subscribe(subscription)
    let userPushToken = undefined
    const existingToken = await db.userPushToken.findOne({ deviceId, userId })
    if (existingToken) {
      userPushToken = await db.userPushToken.updateOne({
        id: existingToken.id,
        data: {
          endpoint: subscription.endpoint,
          auth: subscription.keys.auth,
          p256dh: subscription.keys.p256dh,
        },
      })
    } else {
      userPushToken = await db.userPushToken.createOne({
        userId,
        deviceId,
        endpoint: subscription.endpoint,
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh,
      })
    }

    this.subscriptions[deviceId].pushTextMessage(
      JSON.stringify({
        title: "✅ Test Push Notification",
        body: "You are now subscribed",
      }),
      {},
    )

    return {
      id: userPushToken.id,
      userId,
      deviceId,
      createdAt: userPushToken.createdAt,
      updatedAt: userPushToken.updatedAt,
    }
  }

  public async deviceList(userId: number) {
    const deviceList = await db.userPushToken.findMany({ userId })
    return deviceList.map(({ id, userId, deviceId, createdAt, updatedAt }) => ({
      id,
      userId,
      deviceId,
      createdAt,
      updatedAt,
    }))
  }

  public async unsubscribe(deviceId: string, userId?: number): Promise<void> {
    await db.userPushToken.deleteOne({ deviceId, userId })
    if (this.subscriptions[deviceId]) {
      delete this.subscriptions[deviceId]
    }
  }

  public async send(
    message: {
      title: string
      body?: string
      url?: string
    },
    urgency?: webpush.Urgency,
    ttl?: number,
    topic?: string,
  ): Promise<void> {
    const options: webpush.PushMessageOptions = {
      urgency,
      ttl,
      topic,
    }
    const deviceIds = Object.keys(this.subscriptions)
    for (const deviceId of deviceIds) {
      try {
        await this.subscriptions[deviceId].pushTextMessage(
          JSON.stringify(message),
          options,
        )
      } catch (error) {
        if (
          "response" in error && error.response instanceof Response && error.response.status === 410
        ) {
          console.log("Subscription is no longer valid, deleting", { deviceId })
          await this.unsubscribe(deviceId)
        } else {
          console.error("Error sending push notification", error, { deviceId, message })
        }
      }
    }
  }
}

export const webPushService = await WebPushService.new()
