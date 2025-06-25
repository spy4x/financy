import { ComponentChildren } from "preact"
import { GroupSelector } from "@web/components/system/nav/GroupSelector.tsx"

interface Props {
  children: ComponentChildren
  class?: string
  showGroupSelector?: boolean
}

export function PageTitle({ children, class: klass, showGroupSelector = false }: Props) {
  return (
    <div class="flex gap-3 justify-between">
      <h1
        class={`h1 ml-12 mb-6 pl-1 md:p-0 lg:ml-0 lg:pl-0 leading-none ${klass || ""}`}
      >
        {children}
      </h1>

      {showGroupSelector && <GroupSelector variant="page" />}
    </div>
  )
}
