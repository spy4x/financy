import { NavHeader } from "./NavHeader.tsx"
import { NavItems } from "./NavItems.tsx"
import { GroupSelector } from "./GroupSelector.tsx"
import { ProfileDropdown } from "./ProfileDropdown.tsx"

export function Nav() {
  return (
    <>
      <NavHeader />
      <nav class="flex flex-1 flex-col gap-4">
        <NavItems />
        <GroupSelector />
        <ProfileDropdown />
      </nav>
    </>
  )
}
