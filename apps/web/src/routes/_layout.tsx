import { getEnvVar } from "@client/vite/env.ts"
import { Shell } from "@web/components/system/Shell.tsx"
import { StateInit } from "@web/components/system/StateInit.tsx"
import { Toastr } from "@web/components/system/Toastr.tsx"

const ENV = getEnvVar("ENV", true)

interface Props {
  children: preact.ComponentChildren
}

export function Layout({ children }: Props) {
  return (
    <>
      <StateInit
        ENV={ENV}
      />
      <Toastr />
      <Shell>
        {children}
      </Shell>
    </>
  )
}
