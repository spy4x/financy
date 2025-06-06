import { getEnvVar } from "@server/helpers/env.ts"

export class Config {
  env = getEnvVar("ENV") as "dev" | "prod"
  authCookieSecret = getEnvVar("AUTH_COOKIE_SECRET")
  authPepper = getEnvVar("AUTH_PEPPER")
  authTotp = getEnvVar("AUTH_TOTP")
  devEmail = getEnvVar("DEV_EMAIL")
  vapidKeysPath = "./vapid.json"
  timeZone = getEnvVar("TIMEZONE")
  authSaltRounds = 12 // balance between security and performance
  authSessionLength = 32
  authSessionDurationMin = 60 * 24 * 30 * 2 // 2 months
  rateLimiter = {
    windowMs: Number(getEnvVar("RATE_LIMITER_WINDOW_MS")),
    strictLimit: Number(getEnvVar("RATE_LIMITER_STRICT_LIMIT")),
    limit: Number(getEnvVar("RATE_LIMITER_LIMIT")),
  }

  kv = {
    hostname: getEnvVar("KV_HOSTNAME"),
    port: Number(getEnvVar("KV_PORT")),
  }

  get isDev() {
    return this.env === "dev"
  }
  get isProd() {
    return this.env === "prod"
  }
}

export const config = new Config()
