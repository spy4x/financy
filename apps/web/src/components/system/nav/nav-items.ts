import { Signal, signal } from "@preact/signals"
import { FunctionalComponent } from "preact"
import {
  IconArrowPath,
  IconBuildingOffice2,
  IconCpuChip,
  IconFolder,
  IconHome,
  IconUser,
} from "@client/icons"
import { BadgeColor } from "@web/components/ui/Badge.tsx"
import { routes } from "../../../routes/_router.tsx"
import { isProd } from "@client/vite/env.ts"

export type NavItem =
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

export const navItems: NavItem[] = [
  { name: routes.dashboard.title, href: routes.dashboard.href, Icon: IconHome },
  { name: routes.groups.title, href: routes.groups.href, Icon: IconUser },
  { name: routes.accounts.title, href: routes.accounts.href, Icon: IconBuildingOffice2 },
  { name: routes.categories.title, href: routes.categories.href, Icon: IconFolder },
  { name: routes.transactions.title, href: routes.transactions.href, Icon: IconArrowPath },
  ...(!isProd
    ? [{
      name: "Dev",
      Icon: IconCpuChip,
      isOpen: signal(false),
      subItems: [
        { name: routes.uiGuide.title, href: routes.uiGuide.href },
        { name: routes.notFound.title, href: routes.notFound.href },
      ],
    }]
    : []),
]
