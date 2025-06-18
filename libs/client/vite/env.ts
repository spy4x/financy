export function getEnvVar(name: string, required = false): string {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env
  const value = env[name] || env[`VITE_${name}`]
  if (required && !value) {
    throw new Error(`Environment variable ${name} is required but not set.`)
  }
  return value || ""
}

export const isProd = getEnvVar("ENV") === "prod"
console.log(`Running in ${isProd ? "production" : "development"} mode.`)
