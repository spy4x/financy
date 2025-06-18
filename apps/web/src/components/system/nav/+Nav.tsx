import { NavHeader } from "./NavHeader.tsx"
import { NavItems } from "./NavItems.tsx"
import { GroupSelector } from "./GroupSelector.tsx"
import { ProfileDropdown } from "./ProfileDropdown.tsx"

// effect(() => {
//   if (
//     auth.user.value?.role === UserRole.ADMIN &&
//     !navItems.some((item) => item.name === "Admin")
//   ) {
//     navItems.push({
//       name: "Admin",
//       Icon: IconUser,
//       isOpen: signal(false),
//       subItems: [
//         {
//           name: "Users",
//           href: "/admin/users",
//           //   counter: computed(() => state.user.list.nonDeleted.value.length),
//         },
//         {
//           name: "Commands",
//           href: "/admin/commands",
//         },
//         { name: "Settings", href: "/admin/settings" },
//       ],
//     })
//   }
// })

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
