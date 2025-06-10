import { computed, effect, signal } from "@preact/signals"
import { op, User, UserMFAStatus, UserRole, userSchema, UserUpdate, validate } from "@shared/types"
import { toast } from "./toast.ts"
// import { ws } from "./ws.ts"
import { makeStorage } from "@shared/local-storage"
import { eventBus } from "../services/eventBus.ts"
import {
  UserAuthenticatedOnAppStart,
  UserSignedIn,
  UserSignedOut,
  UserSignedUp,
} from "../cqrs/events.ts"
import { ws } from "./ws.ts"
import { navigate } from "@client/helpers"

const userStorage = makeStorage<User | null>(localStorage, "user", userSchema)
const user = signal(userStorage.get())
const ops = {
  // getMe: signal(op<User>()),
  update: signal(op<User>()),
  signOut: signal(op<void>()),
  passwordCheck: signal(op<User>()),
  passwordSignUp: signal(op<User>()),
  passwordChange: signal(op<void>()),
  TOTPConnectStart: signal(op<{ qrcode: string; secret: string }>()),
  TOTPConnectFinish: signal(op<boolean>()),
  TOTPDisconnect: signal(op<boolean>()),
}

effect(() => userStorage.set(user.value)) // Save user to local storage

export const auth = {
  user,
  ops,
  isRole: (...roles: UserRole[]) => computed(() => user.value && roles.includes(user.value.role)),
  // haveChangeRole: () =>
  //   computed(() =>
  //     Boolean(
  //       user.value &&
  //         [UserRole.SUPERVISOR, UserRole.ADMIN].includes(user.value.role),
  //     )
  //   ),
  // haveMaintainRole: () =>
  //   computed(() =>
  //     Boolean(
  //       user.value &&
  //         [UserRole.OPERATOR, UserRole.SUPERVISOR, UserRole.ADMIN].includes(user.value.role),
  //     )
  //   ),
  init: () => {
    effect(() => {
      // watch user and disconnect WS user signed out
      if (!user.value) ws.disconnect()
    })
    const u = user.value
    // setTimeout - give app some time to init before emitting event, otherwise it may not be handled (other services may not be listening yet)
    if (u) setTimeout(() => eventBus.emit(new UserAuthenticatedOnAppStart(u)))
  },
  setUser: (newUser: null | User): void => {
    user.value = newUser
  },
  passwordCheck: async (username: string, password: string) => {
    ops.passwordCheck.value = op(true)
    try {
      const response = await fetch("/api/auth/password/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        ops.passwordCheck.value = op<User>(false, null, await response.json())
        return
      }
      const responseJson = await response.json()
      return auth.processSignIn(responseJson, response.status)
    } catch (error) {
      ops.passwordCheck.value = op<User>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  processSignIn: (responseJson: User, status: number) => {
    const parseResult = validate(userSchema, responseJson)
    if (parseResult.error) {
      ops.passwordCheck.value = op<User>(false, null, parseResult.error)
      return
    }
    if (status === 200) {
      toast.success({ body: "Signed in" })
      user.value = parseResult.data
      ops.passwordCheck.value = op(false, parseResult.data)
      eventBus.emit(new UserSignedIn(parseResult.data))
      // globalThis.location.reload()
    } else if (status === 202) {
      toast.success({ body: "2FA required" })
      ops.passwordCheck.value = op(false, parseResult.data)
    } else {
      toast.info({ body: "Unknown HTTP response status" })
    }
  },
  passwordSignUp: async (username: string, password: string) => {
    ops.passwordSignUp.value = op(true)
    try {
      const response = await fetch("/api/auth/password/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        ops.passwordSignUp.value = op<User>(false, null, await response.json())
        return
      }
      const responseJson = await response.json()
      const parseResult = validate(userSchema, responseJson)
      if (parseResult.error) {
        ops.passwordSignUp.value = op<User>(false, null, parseResult.error)
        return
      }
      user.value = parseResult.data
      ops.passwordSignUp.value = op(false, parseResult.data)
      eventBus.emit(new UserSignedUp(parseResult.data))
      // globalThis.location.reload()
    } catch (error) {
      ops.passwordSignUp.value = op<User>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  TOTPConnectStart: async () => {
    ops.TOTPConnectStart.value = op(true)
    ops.TOTPConnectFinish.value = op()
    try {
      const response = await fetch("/api/auth/totp/connect/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!response.ok) {
        ops.TOTPConnectStart.value = op<{ qrcode: string; secret: string }>(
          false,
          null,
          await response.json(),
        )
        return
      }
      const result = await response.json()
      if (!user.value) {
        return
      }
      user.value = { ...user.value, mfa: UserMFAStatus.CONFIGURATION_NOT_FINISHED } as User
      ops.TOTPConnectStart.value = op(false, result)
      return
    } catch (error) {
      ops.TOTPConnectStart.value = op<{ qrcode: string; secret: string }>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  TOTPCheck: async (otp: string) => {
    ops.passwordCheck.value = op(true)
    try {
      const response = await fetch("/api/auth/totp/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp }),
      })
      if (!response.ok) {
        ops.passwordCheck.value = op<User>(false, null, await response.json())
        return
      }
      const responseJson = await response.json()
      return auth.processSignIn(responseJson, response.status)
    } catch (error) {
      ops.passwordCheck.value = op<User>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  TOTPConnectFinish: async (otp: string) => {
    ops.TOTPConnectFinish.value = op(true)
    try {
      const response = await fetch("/api/auth/totp/connect/finish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp }),
      })
      if (!response.ok) {
        ops.TOTPConnectFinish.value = op<boolean>(false, null, await response.json())
        toast.error({ body: `Incorrect code` })
        return
      }
      ops.TOTPConnectFinish.value = op(false, true)
    } catch (error) {
      ops.TOTPConnectFinish.value = op<boolean>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  TOTPDisconnect: async () => {
    ops.TOTPDisconnect.value = op(true)
    try {
      const response = await fetch("/api/auth/totp/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!response.ok) {
        ops.TOTPDisconnect.value = op<boolean>(false, null, await response.json())
        return
      }
      ops.TOTPDisconnect.value = op(false, true)
    } catch (error) {
      ops.TOTPDisconnect.value = op<boolean>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  passwordChange: async (password: string, newPassword: string) => {
    ops.passwordChange.value = op(true)
    try {
      const response = await fetch("/api/auth/password/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, newPassword }),
      })
      if (!response.ok) {
        ops.passwordChange.value = op<void>(false, null, await response.json())
        toast.error({
          body:
            "Change password failed. Is your password correct? Is new password longer than 8 symbols?",
        })
        return
      }
      ops.passwordChange.value = op(false)
      toast.success({ body: "Password changed successfully" })
    } catch (error) {
      ops.passwordChange.value = op<void>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  signOut: async () => {
    ops.signOut.value = op(true)
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
      })
      if (!response.ok) {
        ops.signOut.value = op<void>(false, null, await response.json())
        return
      }
      user.value = null
      ops.signOut.value = op(false)
      toast.success({ body: "Signed out" })
      navigate("/")
      eventBus.emit(new UserSignedOut())
      // globalThis.location.href = "/"
      // globalThis.location.reload()
    } catch (error) {
      ops.signOut.value = op<void>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
    }
  },
  // getMe: async () => {
  //   ops.getMe.value = op(true)
  //   try {
  //     const response = await fetch("/api/auth/me")
  //     if (!response.ok) {
  //       ops.getMe.value = op<User>(false, null, await response.json())
  //       return
  //     }
  //     const responseJson = await response.json()
  //     const parseResult = validate(userSchema, responseJson)
  //     if (parseResult.error) {
  //       ops.getMe.value = op<User>(false, null, parseResult.error)
  //       return
  //     }
  //     user.value = parseResult.data
  //     ops.getMe.value = op(false, parseResult.data)
  //   } catch (error) {
  //     ops.getMe.value = op<User>(
  //       false,
  //       null,
  //       error instanceof Error ? error.message : String(error),
  //     )
  //   }
  // },
  update: async (data: UserUpdate) => {
    ops.update.value = op(true)
    try {
      const response = await fetch(`/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        ops.update.value = op<User>(false, null, "Failed to update user")
        toast.error({ body: "Failed to update user" })
        return { error: "Failed to update user", result: null }
      }
      const responseJson = await response.json()
      const parseResult = validate(userSchema, responseJson)
      if (parseResult.error) {
        ops.update.value = op<User>(false, null, parseResult.error)
        toast.error({ body: "Failed to update user" })
        return { error: parseResult.error, result: null }
      }
      ops.update.value = op(false, parseResult.data)
      user.value = parseResult.data
      toast.success({ body: "Profile updated" })
      return { error: null, result: parseResult.data }
    } catch (error) {
      ops.update.value = op<User>(
        false,
        null,
        error instanceof Error ? error.message : String(error),
      )
      toast.error({ body: "Failed to update user" })
      return { error: error instanceof Error ? error.message : String(error), result: null }
    }
  },
}
