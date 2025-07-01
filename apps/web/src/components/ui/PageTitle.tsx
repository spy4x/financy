import { ComponentChildren } from "preact"
import { GroupSelector } from "@web/components/system/nav/GroupSelector.tsx"
import { DateRangeSelector } from "./DateRangeSelector.tsx"

interface Props {
  children: ComponentChildren
  class?: string
  showGroupSelector?: boolean
  showDateRangeSelector?: boolean
}

export function PageTitle(
  { children, class: klass, showGroupSelector = false, showDateRangeSelector = false }: Props,
) {
  return (
    <div class="flex gap-3 justify-between items-start">
      <h1
        class={`h1 ml-12 mb-6 pl-1 md:p-0 lg:ml-0 lg:pl-0 leading-none ${klass || ""}`}
      >
        {children}
      </h1>

      <div class="flex gap-3 items-center">
        {showDateRangeSelector && <DateRangeSelector />}
        {showGroupSelector && <GroupSelector variant="page" />}
      </div>
    </div>
  )
}
