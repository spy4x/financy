// Draws a mouse pointer and a click mark into the page, for a recorded
// demo: headless Chromium records no system cursor. Load it with
// `context.addInitScript({ path })` on the recording context only.
// Optional start position: add `window.__demoPointerStart = { x, y }` as an
// earlier init script. It follows real mouse events (capture phase), so the
// Playwright mouse drives it and the app's own hover states stay real.
;(() => {
  if (globalThis !== globalThis.top) return
  const KEY = `__demoPointer`
  const ACCENT = `#38bdf8`
  let pos = globalThis.__demoPointerStart ?? { x: 40, y: 40 }
  try {
    pos = JSON.parse(sessionStorage.getItem(KEY)) ?? pos
  } catch { /* storage blocked: keep the start position */ }
  const el = document.createElement(`div`)
  el.setAttribute(`aria-hidden`, `true`)
  el.style.cssText = `position:fixed;left:0;top:0;width:24px;height:28px;pointer-events:none;` +
    `z-index:2147483647;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))`
  el.innerHTML = `<svg width="24" height="28" viewBox="0 0 24 28" style="display:block;` +
    `transform-origin:3px 2px;transition:transform 90ms ease-out">` +
    `<path d="M3 2 L3 21.5 L8.3 16.4 L11.9 24.6 L15.3 23.1 L11.8 15.1 L19 14.8 Z" ` +
    `fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  // The arrow's tip (3, 2) is the hotspot.
  const place = () => {
    el.style.transform = `translate(${pos.x - 3}px,${pos.y - 2}px)`
  }
  const mount = () => {
    if (!el.isConnected) (document.body ?? document.documentElement)?.appendChild(el)
  }
  place()
  if (document.readyState === `loading`) document.addEventListener(`DOMContentLoaded`, mount)
  mount()
  addEventListener(`mousemove`, (e) => {
    pos = { x: e.clientX, y: e.clientY }
    place()
    mount()
    try {
      sessionStorage.setItem(KEY, JSON.stringify(pos))
    } catch { /* ignore */ }
  }, true)
  // Opaque ring and dot, so the colour survives a 256-colour GIF palette.
  // Removed when the animation ends, and at once when the page unloads, so
  // a slow navigation never freezes a half-drawn mark on screen.
  const marks = new Set()
  const clear = () => {
    for (const m of marks) m.remove()
    marks.clear()
  }
  addEventListener(`beforeunload`, clear, true)
  addEventListener(`pagehide`, clear, true)
  addEventListener(`mousedown`, (e) => {
    el.firstChild.style.transform = `scale(.7)`
    const m = document.createElement(`div`)
    m.style.cssText = `position:fixed;width:88px;height:88px;margin:-44px 0 0 -44px;` +
      `border-radius:50%;box-sizing:border-box;pointer-events:none;z-index:2147483646;` +
      `left:${e.clientX}px;top:${e.clientY}px;border:5px solid ${ACCENT};` +
      `background:radial-gradient(circle,${ACCENT} 0 14px,transparent 15px)`
    document.documentElement.appendChild(m)
    marks.add(m)
    m.animate([
      { transform: `scale(.25)`, opacity: 1 },
      { transform: `scale(.8)`, opacity: 1, offset: 0.5 },
      { transform: `scale(1)`, opacity: 0 },
    ], { duration: 400, easing: `ease-out`, fill: `forwards` }).onfinish = () => {
      m.remove()
      marks.delete(m)
    }
  }, true)
  addEventListener(`mouseup`, () => {
    el.firstChild.style.transform = ``
  }, true)
})()
