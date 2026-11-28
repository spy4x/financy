/// <reference lib="deno.ns" />
/**
 * Off camera: starts this checkout's development stack for the demo video, apart from any other
 * stack on this machine, and removes it again.
 *
 * - Its own Compose project and container names (`financy-video`), its own hosts
 *   (`app.financy-video.localhost`, `admin.financy-video.localhost`) and spare host ports.
 * - Its own env file, made from `.env.example` by `deno task init`'s own `prepareEnv`, with fresh
 *   secrets; its own web push keys; its database and key-value data in its temporary folder, never
 *   in the checkout's `.volumes/`, which a developer's own stack may be using.
 * - The `admin` profile, which the exchange rates job and the administrator need, and nothing
 *   else: no monitoring, no file store.
 * - Traefik: a running `traefik` container is reused as it is. Otherwise this run starts one, and
 *   only then stops it again; the same goes for the `proxy` network.
 *
 * {@link Stack.stop} removes the containers, volumes and images it made, the temporary folder and
 * whatever of Traefik it started. It is safe to call twice and after a failed start.
 */
import { stringify } from "@std/yaml"
import { generateVapidKeyPair } from "@spy4x/integrations/push"
import { prepareEnv } from "../../../infra/scripts/init.ts"
import { PROXY_NETWORK } from "../../../infra/scripts/proxy-network.ts"

export const PROJECT = "financy-video"
export const HOSTS = {
  app: `http://app.${PROJECT}.localhost`,
  admin: `http://admin.${PROJECT}.localhost`,
}
const ROOT = new URL("../../../", import.meta.url).pathname

/** Runs a command and returns its standard output; throws with its error output when it fails. */
export async function run(cmd: string[], cwd = ROOT): Promise<string> {
  const result = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output()
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim()
  if (!result.success) {
    throw new Error(`${cmd.join(" ")} failed: ${text(result.stderr).slice(-2000)}`)
  }
  return text(result.stdout)
}

/** Whether `cmd` succeeds, quietly. */
async function ok(cmd: string[]): Promise<boolean> {
  const { success } = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: ROOT,
    stdout: "null",
    stderr: "null",
  }).output()
  return success
}

/** A free TCP port on the loopback interface. */
function freePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 })
  const { port } = listener.addr as Deno.NetAddr
  listener.close()
  return port
}

/** Sets `key` to `value` on the last line of an env file's text that sets it. */
function setEnv(text: string, key: string, value: string): string {
  const lines = text.split("\n")
  const at = lines.findLastIndex((line) => line.startsWith(`${key}=`))
  if (at === -1) throw new Error(`.env.example has no ${key}`)
  lines[at] = `${key}=${value}`
  return lines.join("\n")
}

/** Waits until `url` answers 200: Traefik routes a host once its service is healthy. */
async function waitFor(url: string, seconds: number): Promise<void> {
  const deadline = Date.now() + seconds * 1000
  while (true) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      await response.body?.cancel()
      if (response.ok) return
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`${url} did not answer within ${seconds} s`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

/** A running stack: its temporary folder, and how to remove it. */
export interface Stack {
  work: string
  stop(): Promise<void>
}

/**
 * Starts the stack and waits until the app and the admin app answer. On a failed start it removes
 * what it made before it throws.
 */
export async function startStack(): Promise<Stack> {
  const names = (await run(["docker", "ps", "-a", "--format", "{{.Names}}"])).split("\n")
  if (names.some((name) => name.startsWith(`${PROJECT}-`))) {
    throw new Error(`containers named ${PROJECT}-* exist; the recording needs that name`)
  }
  const traefikRunning = (await run(
    ["docker", "container", "inspect", "-f", "{{.State.Running}}", "traefik"],
  ).catch(() => "")) === "true"
  const traefikExists = names.includes("traefik")
  const networkBefore = await ok(["docker", "network", "inspect", PROXY_NETWORK])

  const work = await Deno.makeTempDir({ prefix: `${PROJECT}-` })
  const envFile = `${work}/.env`
  const override = `${work}/compose.video.yml`
  const proxyOverride = `${work}/compose.proxy.yml`
  const compose = [
    ..."docker compose -f infra/compose/compose.shared.yml -f infra/compose/compose.dev.yml".split(" "),
    ...["-f", override, "--env-file", envFile],
  ]
  const proxy = [
    ..."docker compose -f infra/compose/compose.proxy.yml".split(" "),
    ...["-f", proxyOverride, "--env-file", envFile],
  ]
  let traefikStarted: "created" | "started" | null = null

  let stopped: Promise<void> | null = null
  const stop = () =>
    stopped ??= (async () => {
      if (await Deno.stat(envFile).catch(() => null)) {
        await ok([...compose, "--profile", "*", "down", "-v", "--rmi", "local", "--timeout", "5"])
        if (traefikStarted === "created") await ok([...proxy, "down"])
      }
      if (traefikStarted === "started") await ok(["docker", "stop", "traefik"])
      const images = await run(["docker", "images", "-q", `${PROJECT}/*`]).catch(() => "")
      for (const image of new Set(images.split("\n").filter(Boolean))) {
        await ok(["docker", "rmi", "-f", image])
      }
      if (!networkBefore) await ok(["docker", "network", "rm", PROXY_NETWORK])
      // The database container writes its files as its own user.
      await ok(["sudo", "-n", "find", work, "-delete"])
      await Deno.remove(work, { recursive: true }).catch(() => {})
    })()

  try {
    const example = await Deno.readTextFile(`${ROOT}infra/envs/.env.example`)
    let env = prepareEnv(example, undefined, PROJECT).text
    for (
      const [key, value] of [
        ["DOMAIN", new URL(HOSTS.app).host],
        ["ADMIN_DOMAIN", new URL(HOSTS.admin).host],
        ["COMPOSE_PROFILES", "admin"],
        // No file store: nothing on camera uploads, and the API reports a missing one unhealthy.
        ["FILES", "false"],
        ["DB_HOST_PORT", `127.0.0.1:${freePort()}`],
        ["KV_HOST_PORT", `127.0.0.1:${freePort()}`],
        ["GRAFANA_HOST_PORT", `127.0.0.1:${freePort()}`],
      ]
    ) env = setEnv(env, key, value)
    await Deno.writeTextFile(envFile, env)
    const { keys } = await generateVapidKeyPair()
    await Deno.writeTextFile(`${work}/vapid.json`, JSON.stringify(keys))
    for (const dir of ["postgres18", "kv", "traefik"]) {
      await Deno.mkdir(`${work}/volumes/${dir}`, { recursive: true })
      // The database runs as its own user; the temporary folder above keeps others out.
      await Deno.chmod(`${work}/volumes/${dir}`, 0o777)
    }
    // Compose matches a mount by its path in the container, so these replace the checkout's.
    await Deno.writeTextFile(
      override,
      stringify({
        services: {
          db: { volumes: [`${work}/volumes/postgres18:/var/lib/postgresql:Z`] },
          kv: { volumes: [`${work}/volumes/kv:/data:Z`] },
          api: {
            volumes: [{
              type: "bind",
              source: `${work}/vapid.json`,
              target: "/app/vapid.json",
              bind: { create_host_path: false, selinux: "z" },
            }],
          },
        },
      }),
    )
    await Deno.writeTextFile(
      proxyOverride,
      stringify({ services: { traefik: { volumes: [`${work}/volumes/traefik:/letsencrypt`] } } }),
    )

    if (!networkBefore) await run(["docker", "network", "create", PROXY_NETWORK])
    if (!traefikRunning) {
      if (traefikExists) {
        await run(["docker", "start", "traefik"])
        traefikStarted = "started"
      } else {
        traefikStarted = "created"
        await run([...proxy, "up", "-d"])
      }
    }
    console.log(`building and starting the stack (${PROJECT})…`)
    await run([...compose, "build", "deno-base"])
    await run([...compose, "up", "-d", "--build"])
    await waitFor(`${HOSTS.app}/api/health`, 900)
    await waitFor(`${HOSTS.app}/sign-in`, 900)
    await waitFor(`${HOSTS.admin}/sign-in`, 900)
    return { work, stop }
  } catch (error) {
    // What the services said, before they are removed with their logs.
    console.error(await run([...compose, "logs", "--tail", "40", "--no-color"]).catch(String))
    await stop()
    throw error
  }
}
