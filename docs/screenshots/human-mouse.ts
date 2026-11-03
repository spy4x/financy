import type { Locator, Page } from "playwright"

interface Point {
  x: number
  y: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ease = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

/** Moves the real mouse from `from` to `to` along a slightly curved,
 *  ease-in-out path: one step about every 12 ms, over 400–700 ms by
 *  distance. Timed by the clock, so the pace is the same on a slow machine.
 *  `from` is updated in place. */
export async function moveLike(page: Page, from: Point, to: Point): Promise<void> {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const duration = Math.min(700, Math.max(400, dist * 0.8))
  const bow = Math.min(40, dist * 0.08)
  const nx = dist ? -dy / dist : 0
  const ny = dist ? dx / dist : 0
  const t0 = Date.now()
  while (true) {
    const t = Math.min(1, (Date.now() - t0) / duration)
    const e = ease(t)
    const arc = Math.sin(Math.PI * t) * bow
    await page.mouse.move(from.x + dx * e + nx * arc, from.y + dy * e + ny * arc)
    if (t === 1) break
    await sleep(12)
  }
  from.x = to.x
  from.y = to.y
}

/** Scrolls `target` to the middle if it sits near an edge, glides the
 *  pointer to its centre and clicks like a person: pause, press, hold,
 *  release. The 200 ms hold lets the click mark reach full size before a
 *  navigating click clears it. */
export async function clickLike(
  page: Page,
  pointer: Point,
  target: Locator,
  viewportHeight: number,
): Promise<void> {
  await target.waitFor()
  let box = await target.boundingBox()
  if (!box) throw new Error("click target has no box")
  if (box.y < 96 || box.y + box.height > viewportHeight - 48) {
    const delta = Math.round(box.y + box.height / 2 - viewportHeight / 2)
    await page.evaluate(`scrollBy({ top: ${delta}, behavior: "smooth" })`)
    await page.waitForTimeout(800)
    box = await target.boundingBox()
    if (!box) throw new Error("click target has no box")
  }
  await moveLike(page, pointer, {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  })
  await page.waitForTimeout(150)
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForTimeout(200)
}

/** Clicks a field like a person, then types at a readable pace. */
export async function typeLike(
  page: Page,
  pointer: Point,
  field: Locator,
  text: string,
  viewportHeight: number,
): Promise<void> {
  await clickLike(page, pointer, field, viewportHeight)
  await page.keyboard.type(text, { delay: 70 })
}
