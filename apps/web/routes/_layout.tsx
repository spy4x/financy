import { PageProps } from "@fresh/server.ts"
import { getEnvVar } from "@server/helpers/env.ts"
import { Shell } from "../islands/system/Shell.tsx"
import { StateInit } from "../islands/system/StateInit.tsx"
import { Toastr } from "../islands/system/Toastr.tsx"
import { ContextState } from "./_types.ts"

const WEB_API_PREFIX = getEnvVar("WEB_API_PREFIX", true)
const ENV = getEnvVar("ENV", true)

export default function Layout({ Component, url, state }: PageProps<ContextState>) {
  const st = state as unknown as ContextState
  return (
    <>
      <StateInit
        url={url.toString()}
        ENV={ENV}
        WEB_API_PREFIX={WEB_API_PREFIX}
        user={st.user}
      />
      <Toastr />
      <Shell>
        <Component />
      </Shell>
    </>
  )
}
