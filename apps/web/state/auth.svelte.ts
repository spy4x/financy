import { type User, userSchema, validate } from "@shared/types"
import { USER_ID_COOKIE_NAME } from "@shared/constants"
import { getCookie } from "@client/browser/cookie"
import { eventBus } from "../services/eventBus.ts"
import {
  UserAuthenticatedOnAppStart,
  UserSignedIn,
  UserSignedOut,
  UserSignedUp,
} from "../cqrs/events.ts"

// #region App Start
const userIdCookie = getCookie(USER_ID_COOKIE_NAME)
let userId: number | null = null
if (userIdCookie) {
  userId = Number(userIdCookie)
  if (isNaN(userId)) {
    userId = null
  }
}

if (userId) {
  // delay the event emission to allow the app to start
  setTimeout(() => eventBus.emit(new UserAuthenticatedOnAppStart(userId)))
}
// #endregion App Start

// #region State
let _userId = $state<null | number>(userId)
let _isSigningIn = $state(false)
let _signingInError = $state<null | string>(null)
let _isSigningUp = $state(false)
let _signingUpError = $state<null | string>(null)
let _isSigningOut = $state(false)
let _signingOutError = $state<null | string>(null)
// #endregion State

export const auth = {
  // #region State
  /** Currently authenticated user or null otherwise. */
  get userId(): null | number {
    return _userId
  },

  /** Whether a sign-in operation is in progress. */
  get isSigningIn(): boolean {
    return _isSigningIn
  },

  /** Error message from the last sign-in attempt or null otherwise. */
  get signingInError(): null | string {
    return _signingInError
  },

  /** Whether a sign-up operation is in progress. */
  get isSigningUp(): boolean {
    return _isSigningUp
  },

  /** Error message from the last sign-up attempt or null otherwise. */
  get signingUpError(): null | string {
    return _signingUpError
  },

  /** Whether a sign-out operation is in progress. */
  get isSigningOut(): boolean {
    return _isSigningOut
  },

  /** Error message from the last sign-out attempt or null otherwise. */
  get signingOutError(): null | string {
    return _signingOutError
  },
  // #endregion State

  // #region Functions

  /**
   * Signs in the user by sending a POST request to the sign-in endpoint.
   * Updates states accordingly.
   */
  async signIn(email: string, password: string): Promise<null | User> {
    _isSigningIn = true
    _signingInError = null
    try {
      const response = await fetch("/api/auth/password/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, password }),
      })

      const data = await response.json()

      const parseResult = validate(userSchema, data)
      if (parseResult.error) {
        console.error("Error validating user data:", parseResult.error)
        _signingUpError = parseResult.error.description
        return null
      }

      _userId = parseResult.data.id
      eventBus.emit(new UserSignedIn(parseResult.data))

      return parseResult.data
    } catch (error: unknown) {
      console.error("Error signing in:", error)
      _signingInError = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      _isSigningIn = false
    }
  },

  async signUp(email: string, password: string): Promise<null | User> {
    _isSigningUp = true
    _signingUpError = null
    try {
      const response = await fetch("/api/auth/password/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email, password }),
      })

      const data = await response.json()

      const parseResult = validate(userSchema, data)
      if (parseResult.error) {
        console.error("Error validating user data:", parseResult.error)
        _signingUpError = parseResult.error.description
        return null
      }

      _userId = parseResult.data.id
      eventBus.emit(new UserSignedUp(parseResult.data))

      return parseResult.data
    } catch (error: unknown) {
      console.error("Error signing up:", error)
      _signingUpError = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      _isSigningUp = false
    }
  },

  async signOut(): Promise<boolean> {
    _isSigningOut = true
    _signingOutError = null
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error("Failed to sign out")
      }

      eventBus.emit(new UserSignedOut())
      _userId = null

      return true
    } catch (error: unknown) {
      console.error("Error signing out:", error)
      _signingOutError = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      _isSigningOut = false
    }
  },
  // #endregion Functions
}
