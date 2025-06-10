import { effect, Signal, signal, useSignal } from "@preact/signals"
import { FunctionalComponent } from "preact"
import { IconBookOpen, IconChevronDown, IconCpuChip, IconHome, IconUser } from "@client/icons"
import { UserRole, WSStatus } from "@shared/types"
import { Badge, BadgeColor } from "@web/components/ui/Badge.tsx"
import { auth } from "@web/state/auth.ts"
import { page } from "@web/state/page.ts"
import { ws } from "@web/state/ws.ts"
import { navigate } from "@client/helpers"
import { Link } from "wouter-preact"

type NavItem =
  & {
    name: string
    counter?: Signal<number>
    counterColor?: BadgeColor
  }
  & (
    | { Icon: FunctionalComponent<{ class?: string }> }
    | { Icon?: never }
  )
  & (
    | {
      href?: never
      subItems: Omit<NavItem, "Icon">[]
      isOpen: ReturnType<typeof signal<boolean>>
    }
    | {
      href: string
      subItems?: never
      isOpen?: never
    }
  )

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/", Icon: IconHome },
  {
    name: "Devices",
    Icon: IconCpuChip,
    isOpen: signal(false),
    subItems: [
      {
        name: "Regions",
        href: "/devices/regions",
        // counter: computed(() => regions.list.notDeleted.value.length),
      },
    ],
  },
  { name: "UI Guide", href: "/ui-guide", Icon: IconBookOpen },
]
effect(() => {
  if (
    auth.user.value?.role === UserRole.ADMIN &&
    !navItems.some((item) => item.name === "Admin")
  ) {
    navItems.push({
      name: "Admin",
      Icon: IconUser,
      isOpen: signal(false),
      subItems: [
        {
          name: "Users",
          href: "/admin/users",
          //   counter: computed(() => state.user.list.nonDeleted.value.length),
        },
        {
          name: "Commands",
          href: "/admin/commands",
        },
        { name: "Settings", href: "/admin/settings" },
      ],
    })
  }
})

export function Nav() {
  const isProfileDropdownOpen = useSignal(false)

  return (
    <>
      <div class="flex gap-4 h-16 shrink-0 items-center">
        <h3 class="text-purple-100 font-medium text-xl">
          SmartLite
        </h3>
        {(!ws.syncOp.value.inProgress && ws.status.value === WSStatus.CONNECTED)
          ? (
            <div class="inline-flex gap-1.5 items-center border rounded-md px-2.5 py-1 text-xs whitespace-nowrap font-medium capitalize border-green-600 bg-green-600 text-green-50 ml-auto">
              <span class="size-2 rounded-full inline-block bg-green-50" />
              <span>Live</span>
            </div>
          )
          : null}
      </div>
      <nav class="flex flex-1 flex-col gap-4">
        <ul
          role="list"
          class="flex flex-1 flex-col -mx-2 space-y-1"
        >
          {navItems.map(({ name, href, Icon, subItems, isOpen, counter, counterColor }) => (
            <li key={name}>
              <Link
                href={href || "javascript:;"}
                class={`flex gap-x-3 items-center rounded-primary p-2 text-sm leading-6 ${
                  page.url.value.href === href
                    ? "bg-purple-950 text-purple-100"
                    : "text-purple-100 hover:text-white hover:bg-purple-950"
                }`}
                onClick={isOpen && ((e) => {
                  e.preventDefault()
                  isOpen.value = !isOpen.value
                  if (href) {
                    navigate(href)
                  }
                })}
              >
                {Icon && <Icon />}
                {name}
                {counter
                  ? (
                    <Badge
                      color={counterColor || "purpleNav"}
                      text={counter.value.toString()}
                      class="ml-auto"
                    />
                  )
                  : ""}
                {subItems && (
                  <IconChevronDown
                    class={`ml-auto mr-1 size-4 transition-transform ${
                      isOpen.value ? "rotate-180" : ""
                    }`}
                  />
                )}
              </Link>
              {subItems && isOpen.value && (
                <ul>
                  {subItems.map(({ name, href, counter, counterColor }) => (
                    <li key={name}>
                      <Link
                        href={href || "javascript:;"}
                        class={`flex gap-x-1 rounded-primary p-2 pl-11 text-sm leading-6 ${
                          page.url.value
                              .href === href
                            ? "bg-purple-950 text-purple-100"
                            : "text-purple-100 hover:text-white hover:bg-purple-950"
                        }`}
                      >
                        {name}
                        {counter
                          ? (
                            <Badge
                              color={counterColor || "purpleNav"}
                              text={counter.value.toString()}
                              class={`ml-auto`}
                            />
                          )
                          : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {/* Profile dropdown */}
        <div class="relative mt-auto">
          <button
            type="button"
            class="flex items-center w-full"
            id="user-menu-button"
            aria-expanded={isProfileDropdownOpen.value}
            aria-haspopup="true"
            onClick={() =>
              isProfileDropdownOpen.value = !isProfileDropdownOpen
                .value}
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
      </nav>
    </>
  )
}
