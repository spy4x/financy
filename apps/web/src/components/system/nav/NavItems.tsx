import { IconChevronDown } from "@client/icons"
import { Badge } from "@web/components/ui/Badge.tsx"
import { page } from "@web/state/page.ts"
import { navigate } from "@client/helpers"
import { Link } from "wouter-preact"
import { navItems } from "./nav-items.ts"

export function NavItems() {
  return (
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
  )
}
