import { User, userSchema, validate } from "@shared/types"

/**
 * Checks user authentication status via REST API
 * @returns Promise<{ isAuthenticated: boolean, user?: User }>
 */
export async function checkAuthStatus(): Promise<{ isAuthenticated: boolean; user?: User }> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    })

    if (response.status === 401) {
      return { isAuthenticated: false }
    }

    if (!response.ok) {
      // Server error or other non-401 error - assume still authenticated
      console.warn("Failed to check auth status, but not 401:", response.status)
      return { isAuthenticated: true }
    }

    const responseJson = await response.json()
    const parseResult = validate(userSchema, responseJson)
    if (parseResult.error) {
      console.error("Failed to parse user data from auth check", parseResult.error)
      return { isAuthenticated: false }
    }

    return { isAuthenticated: true, user: parseResult.data }
  } catch (error) {
    // Network error or server unavailable - assume still authenticated
    console.warn("Network error during auth check, assuming still authenticated:", error)
    return { isAuthenticated: true }
  }
}
