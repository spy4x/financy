import { type User, userSchema, validate } from "@shared/types"
import { makeStorage } from "@shared/local-storage"

const userStorage = makeStorage<User>(localStorage, "user", userSchema)

// #region State
let _user = $state<null | User>(userStorage.get())
let _isSigningIn = $state(false)
let _signingInError = $state<null | string>(null)
let _isSigningUp = $state(false)
let _signingUpError = $state<null | string>(null)
let _isSigningOut = $state(false)
let _signingOutError = $state<null | string>(null)
// #endregion State

// #region Effects
$effect.root(() => { // use root effect to allow $effect outside of a component
  $effect(() => _user ? userStorage.set(_user) : userStorage.del()) // store user in localStorage
})
// #endregion Effects

export const auth = {
  // #region State
  /** Currently authenticated user or null otherwise. */
  get user(): null | User {
    return _user
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

      _user = parseResult.value

      return parseResult.value
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

      _user = parseResult.value

      return parseResult.value
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
      _user = null
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

// #region On app start
// check if there is a cookie "user_id" and if so, connect websocket
if (document.cookie.includes("user_id")) {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("user_id="))
  if (cookie) {
    const userId = cookie.split("=")[1]
    if (userId) {
      // publish event "user_authenticated" to event bus
    }
  }
}
// #endregion On app start
