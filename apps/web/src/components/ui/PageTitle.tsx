import { ComponentChildren } from "preact"

interface Props {
  children: ComponentChildren
  class?: string
}

export function PageTitle({ children, class: klass }: Props) {
  return (
    <h1
      class={`h1 ml-12 mb-6 pl-1 md:p-0 lg:m-0 leading-none flex gap-3 items-center ${klass || ""}`}
    >
      {children}
    </h1>
  )
}
