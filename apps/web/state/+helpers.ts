import { IS_BROWSER } from "@fresh/runtime.ts"

export const runtimeEnvVars = {
  ENV: "prod",
  API_HOST: IS_BROWSER ? globalThis.location.host : "localhost",
  API_PREFIX: "/api",
}
