import { useSignal, useSignalEffect } from "@preact/signals"
import { auth } from "@web/state/auth.ts"
import { UserMFAStatus } from "@shared/types"
import { IconEye, IconEyeOff } from "@client/icons"

export function Auth() {
  const login = useSignal("")
  const password = useSignal("")
  const isPasswordVisible = useSignal(false)
  const mode = useSignal<"sign-in" | "sign-up">("sign-in")

  const otp = useSignal("")
  const isTimeToCheck2FA = useSignal(false)

  const handleSignIn = (e: Event) => {
    e.preventDefault()
    auth.passwordCheck(login.value, password.value)
  }

  const handleSignUp = (e: Event) => {
    e.preventDefault()
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
              >
                Sign up
              </button>
              <button
                type="submit"
                onClick={(e) => {
                  mode.value === "sign-in"
                  submit(e)
                }}
                class="btn btn-primary w-full"
              >
                Sign in
              </button>
            </div>

            {auth.ops.passwordCheck.value.error && (
              <p class="text-sm text-red-700">
                Invalid credentials
              </p>
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
