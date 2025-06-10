import { auth } from "@web/state/auth.ts"
import { ws } from "@web/state/ws.ts"
import { IconArrowPath, IconBars3, IconLoading, IconXMark } from "@client/icons"
import { Nav } from "./Nav.tsx"
import { Auth } from "./Auth.tsx"
import { ComponentChildren } from "preact"
import { useSignal } from "@preact/signals"
import { WSStatus } from "@shared/types"
import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"

type Props = {
  children: ComponentChildren
}

export function Shell({ children }: Props) {
  const showSidePanel = useSignal(false)
  // const width = useSignal(0);

  function toggleSidePanel() {
    showSidePanel.value = !showSidePanel.value
  }

  const [location] = useLocation()

  useEffect(() => {
    showSidePanel.value = false
  }, [location])

  if (!auth.user.value) {
    return <Auth />
  }

  return (
    <div>
      {/* Off-canvas menu for mobile, show/hide based on off-canvas menu state */}
      {showSidePanel.value && (
        <div
          class="relative z-5000 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={toggleSidePanel}
            class="fixed inset-0 bg-gray-500/75 transition-opacity" /* TODO: transition:fade */
          />

          <div /* TODO: bind:clientWidth={width} transition:fly={{ x: -width }} */ class="fixed inset-0 flex w-full max-w-64">
            <div class="relative flex w-full flex-1">
              <div class="absolute left-full top-0 flex w-16 justify-center">
                <button
                  type="button"
                  class="p-5"
                  onClick={toggleSidePanel}
                >
                  <span class="sr-only">Close sidebar</span>
                  <IconXMark class="size-6 text-white" />
                </button>
              </div>

              {/* Sidebar component */}
              <div class="flex grow flex-col overflow-y-auto bg-primary px-6 pb-4 ring-1 ring-white/10">
                <Nav />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Static sidebar for desktop */}
      <div class="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div class="flex grow flex-col 2xl:gap-y-5 overflow-y-auto bg-primary px-6 pb-4">
          <Nav />
        </div>
      </div>

      <div class="lg:pl-72 relative">
        {ws.status.value !== WSStatus.CONNECTED && (
          <div class="sticky top-0 z-10 flex items-center justify-center bg-orange-600 px-6 py-2.5 sm:px-3.5">
            <p class="text-sm/6 text-white flex items-center gap-4">
              {ws.status.value === WSStatus.CONNECTING && (
                <>
                  <IconLoading class="size-5 text-yellow-500" />
                  <span>Connecting...</span>
                </>
              )}
              {ws.status.value === WSStatus.DISCONNECTED && (
                <>
                  <span class="size-2 rounded-full inline-block bg-white animate-ping" />
                  <span class="">Not connected</span>
                  <button
                    type="button"
                    class="ml-6 font-semibold text-white flex items-center gap-1"
                    onClick={ws.connect}
                  >
                    <IconArrowPath class="size-5" />
                    Retry
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        <button
          type="button"
          class={`${
            ws.status.value === WSStatus.CONNECTED ? "top-0" : "top-11"
          } absolute peer-flex:bg-red-600 left-0 p-6 text-gray-700 lg:hidden`}
          onClick={toggleSidePanel}
        >
          <span class="sr-only">Open sidebar</span>
          <IconBars3 class="size-6" />
        </button>

        <main class="py-6 px-4 sm:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
