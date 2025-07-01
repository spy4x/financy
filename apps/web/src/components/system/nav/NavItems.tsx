import { IconChevronDown, IconPlus } from "@client/icons"
import { Badge } from "@web/components/ui/Badge.tsx"
import { page } from "@web/state/page.ts"
import { navigate } from "@client/helpers"
import { Link } from "wouter-preact"
import { navItems } from "./nav-items.ts"
import { routes } from "../../../routes/_router.tsx"

export function NavItems() {
  // Helper function to get create link for each entity
  const getCreateLink = (name: string) => {
    switch (name) {
      case "Accounts":
        return routes.accounts.children?.create.href
      case "Categories":
        return routes.categories.children?.create.href
      case "Transactions":
        return routes.transactions.children?.create.href
      default:
        return null
    }
  }

  return (
    <ul
      role="list"
      class="flex flex-1 flex-col -mx-2 space-y-1"
    >
      {navItems.map(({ name, href, Icon, subItems, isOpen, counter, counterColor }) => (
        <li key={name}>
          <div class="flex items-center gap-1">
            <Link
              href={href || "javascript:;"}
              class={`flex gap-x-3 items-center rounded-primary p-2 text-sm leading-6 flex-1 ${
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
            {getCreateLink(name) && (
              <Link
                href={getCreateLink(name)!}
                class="flex items-center justify-center p-2 text-purple-100 hover:text-white hover:bg-purple-950 rounded-primary transition-colors shrink-0"
                title={`Create ${name.slice(0, -1)}`} // Remove 's' for singular
              >
                <IconPlus class="size-4" />
              </Link>
            )}
          </div>
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
  )
}
