import { useSignal, useSignalEffect } from "@preact/signals"
import { auth } from "@web/state/auth.ts"
import { UserMFAStatus } from "@shared/types"
import { IconEye, IconEyeOff } from "@client/icons"

// Helper function to extract detailed error message from auth operation
function getErrorMessage(error: unknown): string {
  if (!error) return ""

  // If error is an object with an error property (HTTP response)
  if (typeof error === "object" && error !== null && "error" in error) {
    return (error as { error: string }).error
  }

  // If error is a string (network error, etc.)
  if (typeof error === "string") {
    // Handle common network error messages with human-friendly alternatives
    if (error.toLowerCase().includes("failed to fetch")) {
      return "Unable to connect to the server. Please check your internet connection and try again."
    }
    if (
      error.toLowerCase().includes("network error") || error.toLowerCase().includes("networkerror")
    ) {
      return "Network connection problem. Please check your internet and try again."
    }
    if (error.toLowerCase().includes("timeout")) {
      return "Connection timed out. The server is taking too long to respond."
    }
    if (error.toLowerCase().includes("cors")) {
      return "Connection blocked. Please try refreshing the page."
    }
    if (error.toLowerCase().includes("abort")) {
      return "Request was cancelled. Please try again."
    }

    // Return the original string if it's already user-friendly
    return error
  }

  // Fallback for unknown error types
  return "Something went wrong. Please try again."
}

export function Auth() {
  const login = useSignal("")
  const password = useSignal("")
  const isPasswordVisible = useSignal(false)
  const mode = useSignal<"sign-in" | "sign-up">("sign-in")

  const otp = useSignal("")
  const isTimeToCheck2FA = useSignal(false)

  const handleSignIn = (e: Event) => {
    e.preventDefault()
    // Clear previous errors
    auth.ops.passwordSignUp.value = { ...auth.ops.passwordSignUp.value, error: null }
    auth.passwordCheck(login.value, password.value)
  }

  const handleSignUp = (e: Event) => {
    e.preventDefault()
    // Clear previous errors
    auth.ops.passwordCheck.value = { ...auth.ops.passwordCheck.value, error: null }
    auth.passwordSignUp(login.value, password.value)
  }

  const handleOTP = (e: Event) => {
    e.preventDefault()
    auth.TOTPCheck(otp.value)
  }

  const submit = (e: Event) => {
    if (isTimeToCheck2FA.value) {
      handleOTP(e)
    } else if (mode.value === "sign-up") {
      handleSignUp(e)
    } else {
      handleSignIn(e)
    }
  }

  useSignalEffect(() => {
    const user = auth.ops.passwordCheck.value.result
    if (!isTimeToCheck2FA.value && user && user.mfa === UserMFAStatus.CONFIGURED) {
      isTimeToCheck2FA.value = true
    }
  })

  return (
    <div class="flex min-h-dvh flex-col justify-center px-6 lg:px-8">
      <h1 class="text-center mt-10 mb-5 lg:mt-20 lg:mb-10">
        <span class="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-purple-950">
          Financy
        </span>
      </h1>
      <div class="mx-auto w-full max-w-md">
        <form
          onSubmit={submit}
          class="card"
        >
          <fieldset
            class="card-body space-y-8"
            disabled={auth.ops.passwordCheck.value.inProgress}
          >
            <div>
              <label for="email" class="label">Username</label>
              <div class="mt-2">
                <input
                  id="login"
                  name="login"
                  type="text"
                  autocomplete="email"
                  class="input"
                  data-e2e="email-input"
                  value={login.value}
                  onInput={(e) =>
                    e.target &&
                    (login.value = (e.target as HTMLInputElement).value.trim())}
                />
              </div>
            </div>

            <div>
              <label for="password" class="label">Password</label>

              <div class="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type={isPasswordVisible.value ? "text" : "password"}
                  autocomplete="current-password"
                  class="input pr-11"
                  data-e2e="password-input"
                  value={password.value}
                  onInput={(e) =>
                    e.target &&
                    (password.value = (e.target as HTMLInputElement).value
                      .trim())}
                />
                <div class="absolute top-1.5 right-1.5">
                  <button
                    type="button"
                    class="btn-input-icon"
                    title={`Make password ${isPasswordVisible.value ? "hidden" : "visible"}`}
                    onClick={() => {
                      isPasswordVisible.value = !isPasswordVisible.value
                    }}
                  >
                    {isPasswordVisible.value ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
            </div>

            {isTimeToCheck2FA.value &&
              (
                <div>
                  <label for="otp" class="label">One Time Password</label>
                  <div class="mt-2">
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      class="input"
                      data-e2e="otp-input"
                      value={otp.value}
                      onInput={(e) =>
                        e.target &&
                        (otp.value = (e.target as HTMLInputElement).value
                          .trim())}
                    />
                  </div>
                </div>
              )}

            <div class="flex gap-2">
              <button
                type="button"
                onClick={(e) => {
                  mode.value = "sign-up"
                  submit(e)
                }}
                class="btn btn-primary-outline w-full"
                data-e2e="sign-up-button"
              >
                Sign up
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  mode.value = "sign-in"
                  submit(e)
                }}
                class="btn btn-primary w-full"
                data-e2e="sign-in-button"
              >
                Sign in
              </button>
            </div>

            {(auth.ops.passwordCheck.value.error || auth.ops.passwordSignUp.value.error) && (
              <div class="text-sm text-red-700 space-y-1" data-e2e="auth-error">
                {auth.ops.passwordCheck.value.error && (
                  <p data-e2e="sign-in-error">
                    <strong>Sign in failed:</strong>{" "}
                    {getErrorMessage(auth.ops.passwordCheck.value.error)}
                  </p>
                )}
                {auth.ops.passwordSignUp.value.error && (
                  <p data-e2e="sign-up-error">
                    <strong>Sign up failed:</strong>{" "}
                    {getErrorMessage(auth.ops.passwordSignUp.value.error)}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        </form>
      </div>
      <div class="mt-auto overflow-hidden">
        <img
          class="translate-y-px mx-auto w-80 lg:w-96 xl:w-full xl:max-w-lg"
          src="../img/trees.svg"
          alt="Gardens by the Bay"
        />
      </div>
    </div>
  )
}
