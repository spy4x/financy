/// <reference lib="deno.ns" />
/**
 * Financy runs with Seed's notes example off (`NOTES=false`, `SPA_NOTES=false`), so a pull request
 * must run `e2e/notes-off.e2e.ts` on a stack started that way. The spec skips on any other stack,
 * so a command without both variables would show green and check nothing. Seed's CI never runs it.
 */

import { expect } from "@std/expect"
import { fromFileUrl } from "@std/path"
import { parse } from "@std/yaml"
import { blockingSteps, type Step } from "./ci-browser-tests.test.ts"

const ROOT = new URL("../", import.meta.url)
const NOTES_OFF =
  `NOTES=false SPA_NOTES=false deno task e2e:local e2e/notes-off.e2e.ts --max-failures=3`

const workflow = async () =>
  parse(await Deno.readTextFile(fromFileUrl(new URL(`.woodpecker/ci.yml`, ROOT)))) as
    & Step
    & { steps?: Record<string, Step> }

Deno.test("a pull request and a tag run the notes-off spec on a notes-off stack in e2e-smoke", async () => {
  const ci = await workflow()
  expect(blockingSteps(ci, NOTES_OFF, `pull_request`, `main`)).toEqual([`e2e-smoke`])
  expect(blockingSteps(ci, NOTES_OFF, `tag`, `main`)).toEqual([`e2e-smoke`])
})

Deno.test("the notes-off spec CI names is a file in e2e/", async () => {
  const info = await Deno.stat(fromFileUrl(new URL(`e2e/notes-off.e2e.ts`, ROOT)))
  expect(info.isFile).toBe(true)
})
