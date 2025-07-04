import { useRef } from "preact/hooks"
import { useSignal, useSignalEffect } from "@preact/signals"
import { MIN_PASSWORD_LENGTH } from "@shared/constants/+index.ts"
import { IconCheckCircle, IconEye, IconEyeOff, IconLoading } from "@client/icons"
import { set } from "@client/helpers"
import { User, userBaseSchema, UserMFAStatus, validate } from "@shared/types"
import { auth } from "@web/state/auth.ts"
import { CopyButton } from "@web/components/ui/CopyButton.tsx"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { formatTime } from "@shared/helpers/format.ts"
import { pushNotification } from "@web/state/pushNotification.ts"
import { Link } from "wouter-preact"

export function Profile() {
  const isInitialized = useRef(false)
  const error = useSignal("")
  const otp = useSignal("")
  const password = useSignal("")
  const newPassword = useSignal("")
  const shouldShowTOTPSetup = useSignal(false)
  const vm = useSignal(validate(userBaseSchema, {}).data as User)
  const isPasswordVisible = useSignal(false)

  useSignalEffect(() => {
    if (
      !isInitialized.current
    ) {
      const editVM = auth.user.value
      if (editVM) {
        vm.value = structuredClone(editVM)
        error.value = ""
        isInitialized.current = true
      } else {
        error.value = "User not found"
      }
    }
  })

  useSignalEffect(() => {
    if (auth.ops.TOTPConnectFinish.value.result && vm.value.mfa !== UserMFAStatus.CONFIGURED) {
      vm.value.mfa = UserMFAStatus.CONFIGURED
      shouldShowTOTPSetup.value = false
    }
    if (auth.ops.TOTPDisconnect.value.result && vm.value.mfa === UserMFAStatus.CONFIGURED) {
      vm.value.mfa = UserMFAStatus.NOT_CONFIGURED
    }
  })

  function submit(e: Event) {
    e.preventDefault()
    auth.update(vm.value)
  }

  function TOTPConnectStart(e: Event) {
    e.preventDefault()
    shouldShowTOTPSetup.value = true
    auth.TOTPConnectStart()
  }

  function TOTPConnectFinish(e: Event) {
    e.preventDefault()
    auth.TOTPConnectFinish(otp.value)
  }

  function TOTPDisconnect(e: Event) {
    e.preventDefault()
    auth.TOTPDisconnect()
  }

  function passwordChange(e: Event) {
    e.preventDefault()
    if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
      return alert(`Password is too short. Minimum length is ${MIN_PASSWORD_LENGTH} characters.`)
    }
    auth.passwordChange(password.value, newPassword.value)
  }

  function togglePushNotifications(e: Event) {
    e.preventDefault()
    if (pushNotification.isSubscribed.value) {
      pushNotification.unsubscribe()
    } else {
      pushNotification.subscribe()
    }
  }

  function disableDevicePushNotifications(deviceId: string) {
    if (deviceId === pushNotification.deviceId.value) {
      pushNotification.unsubscribe()
    } else {
      pushNotification.unsubscribeDevice(deviceId)
    }
  }

  function telegramConnect(e: Event) {
    e.preventDefault()
    auth.telegramConnect()
  }

  function telegramDisconnect(e: Event) {
    e.preventDefault()
    auth.telegramDisconnect()
  }

  return (
    <section class="page-layout">
      <PageTitle>Profile</PageTitle>
      {error && <p class="text-red-700">{error}</p>}

      <form class="card">
        <fieldset
          disabled={auth.ops.update.value.inProgress}
        >
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div class="sm:col-span-2">
                <label for="firstName" class="label">
                  First Name
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="firstName"
                    class="input"
                    value={vm.value.firstName}
                    onBlur={(e) => set(vm, { firstName: e.currentTarget.value.trim() })}
                  />
                </div>
              </div>
              <div class="sm:col-span-2">
                <label for="lastName" class="label">
                  Last Name
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="lastName"
                    class="input"
                    value={vm.value.lastName}
                    onBlur={(e) => set(vm, { lastName: e.currentTarget.value.trim() })}
                  />
                </div>
              </div>
              <div class="sm:col-span-2">
                <label class="label">
                  Role
                </label>
                <div class="mt-2 h-12 flex items-center gap-2">
                  Not implemented yet
                  {
                    /* {userRoleToString[vm.value.role] === "Admin"
                    ? <IconShieldCheck class="text-primary size-5" />
                    : null}

                  <span>{userRoleToString[vm.value.role]}</span> */
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <Link href="/" class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              onClick={submit}
              type="submit"
              class="btn btn-primary"
            >
              {(auth.ops.update.value.inProgress) &&
                <IconLoading />}
              Save
            </button>
          </div>
        </fieldset>
      </form>

      <form class="card">
        <fieldset
          disabled={pushNotification.subscribeOp.value.inProgress ||
            pushNotification.unsubscribeOp.value.inProgress ||
            !!Object.values(pushNotification.unsubscribeDeviceOps.value).find((item) =>
              !!item.inProgress
            ) ||
            pushNotification.listOp.value.inProgress}
        >
          <div class="card-body">
            <div class="h2 mb-6">Push notifications</div>
            {!pushNotification.isServiceWorkerSupported.value && (
              <div class="flex gap-2 items-center text-red-600 mb-6">
                <IconCheckCircle class="size-5" />
                <span>Push notifications are not supported in this browser</span>
              </div>
            )}

            {pushNotification.isSubscribed.value && (
              <div>
                <div class="flex gap-2 items-center text-green-700 mb-6">
                  <IconCheckCircle class="size-5" />
                  <span>Push notifications enabled</span>
                </div>
                <button
                  type="button"
                  class="mt-2 btn btn-danger-outline"
                  onClick={togglePushNotifications}
                >
                  {pushNotification.unsubscribeOp.value?.inProgress && <IconLoading />}
                  Disable for this device
                </button>
              </div>
            )}

            {!pushNotification.isSubscribed.value &&
              pushNotification.isServiceWorkerSupported.value && (
              <button type="button" class="btn btn-primary" onClick={togglePushNotifications}>
                {pushNotification.subscribeOp.value?.inProgress && <IconLoading />}
                Enable for this device
              </button>
            )}

            {!!pushNotification.list.value.length &&
              (
                <div class="w-full">
                  <p class="my-2">Devices with enabled notifications:</p>
                  {pushNotification.list.value.map((userPushToken) => (
                    <div class="flex justify-between mt-6">
                      <div class="text-sm">
                        <p>
                          <b>Device Id:</b> {userPushToken.deviceId}{" "}
                          {userPushToken.deviceId === pushNotification.deviceId.value
                            ? "(This device)"
                            : ""}
                        </p>
                        <p>
                          <b>Created At:</b> {formatTime(userPushToken.createdAt)}
                        </p>
                        <p>
                          <b>Updated At:</b> {formatTime(userPushToken.updatedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="btn btn-danger-outline"
                        onClick={() => disableDevicePushNotifications(userPushToken.deviceId)}
                      >
                        {pushNotification.unsubscribeDeviceOps.value[userPushToken.deviceId]
                          ?.inProgress &&
                          <IconLoading />}
                        Disable
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </fieldset>
      </form>

      <form class="card">
        <fieldset
          disabled={auth.ops.TOTPConnectStart.value.inProgress ||
            auth.ops.TOTPConnectFinish.value.inProgress ||
            auth.ops.TOTPDisconnect.value.inProgress}
        >
          <div class="card-body">
            <div class="h2 mb-6">Two-Factor Authentication</div>

            {!auth.ops.TOTPDisconnect.value.result &&
              (vm.value.mfa === UserMFAStatus.CONFIGURED ||
                auth.ops.TOTPConnectFinish.value.result) &&
              (
                <div>
                  <div class="flex gap-2 items-center text-green-700 mb-6">
                    <IconCheckCircle class="size-5" />
                    <span>Configured</span>
                  </div>
                  <button
                    type="button"
                    class="mt-2 btn btn-danger-outline"
                    onClick={TOTPDisconnect}
                  >
                    Disable
                  </button>
                </div>
              )}

            {vm.value.mfa !== UserMFAStatus.CONFIGURED && !shouldShowTOTPSetup.value && (
              <button type="button" class="btn btn-primary" onClick={TOTPConnectStart}>
                Configure
              </button>
            )}
            {auth.ops.TOTPConnectStart.value.inProgress && <IconLoading />}
            {auth.ops.TOTPConnectStart.value.result && shouldShowTOTPSetup.value &&
              (
                <div class="w-full">
                  <p>Scan the QR code with your Authenticator app:</p>
                  <div
                    class="mt-4 w-72 border"
                    dangerouslySetInnerHTML={{
                      __html: auth.ops.TOTPConnectStart.value.result.qrcode,
                    }}
                  />
                  <div class="mt-4">
                    <CopyButton
                      title="Or copy secret to add manually"
                      textToCopy={auth.ops.TOTPConnectStart.value.result.secret}
                    />
                  </div>
                  <div class="mt-8 sm:col-span-3">
                    <label for="otp" class="label">
                      Enter a generated code to finish setup:
                    </label>
                    <div class="mt-2 flex">
                      <input
                        type="text"
                        id="otp"
                        class="input w-28"
                        value={otp.value}
                        onBlur={(e) =>
                          e.target &&
                          (otp.value = (e.target as HTMLInputElement).value.trim())}
                      />
                      <button
                        class="ml-4 btn btn-primary"
                        onClick={TOTPConnectFinish}
                        type="button"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </fieldset>
      </form>

      <form class="card">
        <fieldset
          disabled={auth.ops.telegramConnect.value.inProgress ||
            auth.ops.telegramDisconnect.value.inProgress}
        >
          <div class="card-body">
            <div class="h2 mb-6">Telegram</div>

            {!auth.ops.telegramDisconnect.value.result &&
              !auth.ops.telegramConnect.value.result && (
              <div>
                <p class="text-gray-600 mb-6">
                  Connect your Telegram account to receive notifications and interact with your
                  financial data through the Telegram bot.
                </p>
                <button type="button" class="btn btn-primary" onClick={telegramConnect}>
                  Connect Telegram
                </button>
                {auth.ops.telegramConnect.value.inProgress && <IconLoading />}
                {auth.ops.telegramConnect.value.error && (
                  <div class="mt-4 text-red-600">
                    {auth.ops.telegramConnect.value.error}
                  </div>
                )}
              </div>
            )}

            {auth.ops.telegramConnect.value.result && !auth.ops.telegramDisconnect.value.result && (
              <div>
                <div class="flex gap-2 items-center text-green-700 mb-6">
                  <IconCheckCircle class="size-5" />
                  <span>Connection code generated</span>
                </div>
                <div class="bg-gray-50 p-4 rounded-md mb-6">
                  <p class="text-sm text-gray-600 mb-2">
                    <strong>Connection Code:</strong>
                  </p>
                  <code class="text-lg font-mono bg-white px-3 py-2 rounded border">
                    {auth.ops.telegramConnect.value.result.code}
                  </code>
                  <p class="text-sm text-gray-600 mt-3">
                    1. Open Telegram and search for your Financy bot<br />
                    2. Send the command:{" "}
                    <code>/link {auth.ops.telegramConnect.value.result.code}</code>
                    <br />
                    3. The bot will confirm when your account is connected
                  </p>
                  <p class="text-xs text-gray-500 mt-2">
                    This code expires in 10 minutes.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick={telegramConnect}
                >
                  Generate New Code
                </button>
              </div>
            )}

            {(auth.ops.telegramDisconnect.value.result === false ||
              (auth.ops.telegramConnect.value.error &&
                String(auth.ops.telegramConnect.value.error).includes("already linked"))) && (
              <div>
                <div class="flex gap-2 items-center text-green-700 mb-6">
                  <IconCheckCircle class="size-5" />
                  <span>Telegram connected</span>
                </div>
                <p class="text-gray-600 mb-6">
                  Your Telegram account is connected. You can now use the Telegram bot to interact
                  with your financial data.
                </p>
                <button
                  type="button"
                  class="btn btn-danger-outline"
                  onClick={telegramDisconnect}
                >
                  Disconnect Telegram
                </button>
                {auth.ops.telegramDisconnect.value.inProgress && <IconLoading />}
                {auth.ops.telegramDisconnect.value.error && (
                  <div class="mt-4 text-red-600">
                    {auth.ops.telegramDisconnect.value.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </fieldset>
      </form>

      <form class="card">
        <fieldset
          disabled={auth.ops.TOTPConnectStart.value.inProgress ||
            auth.ops.TOTPConnectFinish.value.inProgress ||
            auth.ops.TOTPDisconnect.value.inProgress}
        >
          <div class="card-body">
            <div class="h3 mb-6">Change password</div>
            <div class="grid grid-cols-1 gap-5 sm:grid-cols-4">
              <div class="sm:col-span-2">
                <label for="password" class="label">
                  Old Password
                </label>
                <div class="mt-2">
                  <input
                    type={isPasswordVisible.value ? "text" : "password"}
                    id="password"
                    class="input"
                    value={password.value}
                    onInput={(e) =>
                      e.target &&
                      (password.value = (e.target as HTMLInputElement).value.trim())}
                  />
                </div>
              </div>
              <div class="sm:col-span-2">
                <label for="newPassword" class="label">
                  New Password
                </label>
                <div class="mt-2 relative">
                  <input
                    type={isPasswordVisible.value ? "text" : "password"}
                    id="newPassword"
                    class="input pr-11"
                    value={newPassword.value}
                    onInput={(e) =>
                      e.target &&
                      (newPassword.value = (e.target as HTMLInputElement).value.trim())}
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
            </div>
          </div>
          <div class="card-footer">
            <button
              type="button"
              class="btn btn-primary ml-auto"
              disabled={!password.value || !newPassword.value}
              onClick={passwordChange}
            >
              Submit
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
