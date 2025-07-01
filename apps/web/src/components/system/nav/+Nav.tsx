import { NavHeader } from "./NavHeader.tsx"
import { NavItems } from "./NavItems.tsx"
import { GroupSelector } from "./GroupSelector.tsx"
import { ProfileDropdown } from "./ProfileDropdown.tsx"

export function Nav() {
  return (
    <>
      <NavHeader />
      <nav class="flex flex-1 flex-col gap-4">
        <GroupSelector />
        <div class="border-b border-purple-800 dark:border-purple-600"></div>
        <NavItems />
        <ProfileDropdown />
      </nav>
    </>
  )
}
