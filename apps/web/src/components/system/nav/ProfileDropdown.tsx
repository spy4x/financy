import { useSignal } from "@preact/signals"
import { IconChevronDown, IconUser } from "@client/icons"
import { auth } from "@web/state/auth.ts"
import { Link } from "wouter-preact"

export function ProfileDropdown() {
  const isProfileDropdownOpen = useSignal(false)

  return (
    <div class="relative mt-auto">
      <button
        type="button"
        class="flex items-center w-full"
        id="user-menu-button"
        aria-expanded={isProfileDropdownOpen.value}
        aria-haspopup="true"
        onClick={() => isProfileDropdownOpen.value = !isProfileDropdownOpen.value}
      >
        <span class="sr-only">Open user menu</span>
        <span class="shrink-0 size-8 rounded-full bg-gray-50 flex justify-center items-center text-primary">
          <IconUser />
        </span>
        <span class="flex gap-2 items-center justify-between">
          <span
            class="ml-4 text-sm leading-6 text-purple-100 text-left"
            aria-hidden="true"
          >
            {auth.user.value?.firstName} {auth.user.value?.lastName}
          </span>
          <IconChevronDown
            class={`size-4 text-purple-200 transition-transform ${
              isProfileDropdownOpen.value ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      {isProfileDropdownOpen.value && (
        <div
          class="absolute bottom-full left-0 z-1000 mb-2 w-full origin-bottom-right rounded-primary bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-hidden"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          tabIndex={-1}
        >
          <Link
            href="/profile"
            class="block w-full px-3 py-2 text-sm leading-6 text-gray-900 hover:bg-gray-100"
            role="menuitem"
            tabIndex={-1}
            id="user-menu-item-0"
            onClick={() => {
              isProfileDropdownOpen.value = false
            }}
          >
            Your profile
          </Link>
          <button
            onClick={() => {
              auth.signOut()
              isProfileDropdownOpen.value = false
            }}
            class="block w-full px-3 py-2 text-sm leading-6 text-gray-900 hover:bg-gray-100 text-left"
            role="menuitem"
            tabIndex={-1}
            id="user-menu-item-1"
            type="button"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
