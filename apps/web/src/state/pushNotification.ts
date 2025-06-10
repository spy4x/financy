import { computed, effect, signal } from "@preact/signals"
import { OperationState, UserPushToken, userPushTokenSchema, validate } from "@shared/types"
import { set } from "@client/helpers"
import { runtimeEnvVars } from "./+helpers.ts"
import { auth } from "./auth.ts"
import { toast } from "./toast.ts"
import { urlBase64ToUint8Array } from "@shared/helpers/format.ts"

interface State {
  isSubscribed: boolean
  isServiceWorkerSupported: boolean
  vapidKey: string
  deviceId: string
  list: UserPushToken[]
  listOp: OperationState<UserPushToken[]>
  getVapidKeyOp: OperationState<boolean>
  subscribeOp: OperationState<boolean>
  unsubscribeOp: OperationState<boolean>
  unsubscribeDeviceOps: { [deviceId: string]: OperationState<boolean> }
}

const initialState: State = {
  isSubscribed: false,
  isServiceWorkerSupported: "serviceWorker" in navigator,
  vapidKey: "",
  deviceId: "",
  list: [],
  listOp: { inProgress: false, error: null, result: null },
  getVapidKeyOp: { inProgress: false, error: null, result: null },
  subscribeOp: { inProgress: false, error: null, result: null },
  unsubscribeOp: { inProgress: false, error: null, result: null },
  unsubscribeDeviceOps: {},
}

const store = signal<State>(initialState)

async function load(): Promise<void> {
  set(store, { listOp: { inProgress: true, error: null, result: null } })
  let isSubscribed = false
  let deviceId = localStorage.getItem("deviceId")
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem("deviceId", deviceId)
  }
  set(store, { deviceId })

  try {
    set(store, { getVapidKeyOp: { inProgress: true, error: null, result: null } })
    const response = await fetch(
      `${runtimeEnvVars.API_PREFIX}/push-notifications/public-key`,
    )
    if (!response.ok) {
      throw new Error("Failed to load vapid key")
    }
    const { publicKey } = await response.json()
    set(store, {
      vapidKey: publicKey,
      getVapidKeyOp: { inProgress: false, error: null, result: true },
    })
  } catch (error) {
    set(store, {
      getVapidKeyOp: {
        inProgress: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      },
    })
  }

  try {
    const response = await fetch(`${runtimeEnvVars.API_PREFIX}/push-notifications/devices`)
    if (!response.ok) {
      throw new Error("Failed to load device list")
    }
    const { data } = await response.json()
    const userPushTokens = (data as unknown[]).map((token) => {
      const parseResult = validate(userPushTokenSchema, token)
      if (parseResult.error) {
        throw new Error(`Invalid user push token: ${parseResult.error.description}`)
      }
      return parseResult.data
    }).filter((token): token is UserPushToken => token !== null)
    isSubscribed = !!userPushTokens.find((token) => token.deviceId === deviceId)
    set(store, {
      list: userPushTokens,
      listOp: { inProgress: false, error: null, result: userPushTokens },
    })
    if (isSubscribed) {
      set(store, {
        isSubscribed: true,
      })
    } else if ("serviceWorker" in navigator) {
      const serviceWorkerRegistration = await navigator.serviceWorker.ready
      const subscription = await serviceWorkerRegistration.pushManager.getSubscription()
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  } catch (error) {
    set(store, {
      listOp: {
        inProgress: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      },
    })
    console.error(error)
  }
}

export const pushNotification = {
  isSubscribed: computed(() => store.value.isSubscribed),
  isServiceWorkerSupported: computed(() => store.value.isServiceWorkerSupported),
  vapidKey: computed(() => store.value.vapidKey),
  deviceId: computed(() => store.value.deviceId),
  list: computed(() => store.value.list),
  listOp: computed(() => store.value.listOp),
  subscribeOp: computed(() => store.value.subscribeOp),
  unsubscribeOp: computed(() => store.value.unsubscribeOp),
  unsubscribeDeviceOps: computed(() => store.value.unsubscribeDeviceOps),
  init: () => {
    let isUser = false
    effect(() => {
      if (!isUser && auth.user.value) {
        isUser = true
        load()
      } else if (isUser && !auth.user.value) {
        isUser = false
        set(store, initialState)
      }
    })
  },
  subscribe: async () => {
    const vapidKey = store.value.vapidKey
    const deviceId = store.value.deviceId
    set(store, {
      subscribeOp: { inProgress: true, error: null, result: null },
    })
    try {
      if (!vapidKey) {
        throw new Error("No vapid key")
      }
      if (!deviceId) {
        throw new Error("No device id")
      }
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service worker not supported")
      }
      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        "./sw.js",
        {
          scope: "/",
          type: "module",
        },
      )
      const newSubscription = await new Promise((resolve) => {
        const onServiceWorkerActive = async () => {
          // Create a push subscription.
          const subscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          })

          // Return it.
          return resolve(subscription)
        }

        // Call onServiceWorkerActive when service worker become active.
        const sw = serviceWorkerRegistration.active ?? serviceWorkerRegistration.waiting ??
          serviceWorkerRegistration.installing
        if (sw?.state === "activated") {
          onServiceWorkerActive()
        } else if (sw !== null) {
          sw.onstatechange = () => {
            if (sw.state === "activated") {
              onServiceWorkerActive()
            }
          }
        } else {
          throw new Error("Service worker not found")
        }
      })
      if (!newSubscription) {
        throw new Error("Subscription was not created")
      }

      const response = await fetch(
        `${runtimeEnvVars.API_PREFIX}/push-notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subscription: newSubscription,
            deviceId,
          }),
        },
      )
      if (!response.ok) {
        throw new Error("Failed to submit subscription")
      }

      const { userPushToken } = await response.json()
      set(store, {
        isSubscribed: true,
        list: [...store.value.list, userPushToken],
        subscribeOp: { inProgress: false, error: null, result: true },
      })
      toast.success({ body: "Subscribed to push notifications" })
    } catch (error) {
      set(store, {
        subscribeOp: {
          inProgress: false,
          error: error instanceof Error ? error.message : String(error),
          result: null,
        },
      })
      console.error(error)
      toast.error({
        title: "Failed to subscribe",
        body: error instanceof Error ? error.message : String(error),
      })
    }
  },
  unsubscribe: async () => {
    const deviceId = store.value.deviceId
    set(store, {
      unsubscribeOp: { inProgress: true, error: null, result: null },
    })
    try {
      if (!deviceId) {
        throw new Error("Device id is not set")
      }
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service worker not supported")
      }
      const serviceWorkerRegistration = await navigator.serviceWorker.ready
      const subscription = await serviceWorkerRegistration.pushManager.getSubscription()
      if (subscription) {
        const isSuccess = await subscription.unsubscribe()
        console.error("Unsubscribe result", isSuccess)
      }

      const response = await fetch(
        `${runtimeEnvVars.API_PREFIX}/push-notifications`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deviceId }),
        },
      )
      if (!response.ok) {
        throw new Error("Failed to submit unsubscribe")
      }

      set(store, {
        isSubscribed: false,
        list: store.value.list.filter((token) => token.deviceId !== deviceId),
        unsubscribeOp: { inProgress: false, error: null, result: true },
      })
      toast.success({ body: "Unsubscribed from push notifications" })
    } catch (error) {
      set(store, {
        unsubscribeOp: {
          inProgress: false,
          error: error instanceof Error ? error.message : String(error),
          result: null,
        },
      })
      console.error(error)
      toast.error({
        title: "Failed to unsubscribe",
        body: error instanceof Error ? error.message : String(error),
      })
    }
  },
  unsubscribeDevice: async (deviceId: string) => {
    set(store, {
      unsubscribeDeviceOps: {
        ...store.value.unsubscribeDeviceOps,
        [deviceId]: { inProgress: true, error: null, result: null },
      },
    })
    try {
      const response = await fetch(
        `${runtimeEnvVars.API_PREFIX}/push-notifications`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ deviceId }),
        },
      )
      if (!response.ok) {
        throw new Error("Failed to submit unsubscribe")
      }

      set(store, {
        list: store.value.list.filter((token) => token.deviceId !== deviceId),
        unsubscribeDeviceOps: {
          ...store.value.unsubscribeDeviceOps,
          [deviceId]: { inProgress: false, error: null, result: true },
        },
      })
      toast.success({ body: "Device unsubscribed from push notifications" })
    } catch (error) {
      set(store, {
        unsubscribeDeviceOps: {
          ...store.value.unsubscribeDeviceOps,
          [deviceId]: {
            inProgress: false,
            error: error instanceof Error ? error.message : String(error),
            result: null,
          },
        },
      })
      toast.error({ body: "Failed to unsubscribe device" })
    }
  },
}
