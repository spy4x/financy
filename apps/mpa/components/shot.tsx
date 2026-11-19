import type { JSX } from "preact"
import { WindowFrame } from "@spy4x/preact-ui/window-frame"

/** Whether a screenshot was taken on the desktop viewport (1280×800) or the phone one (390×844). */
export type ShotKind = "desktop" | "mobile"

/**
 * When a picture shows its dark theme: on a device that asks for dark, and only with JavaScript on,
 * since without it `/theme.js` never darkens the page (`routes/_app.tsx`) and a dark picture would
 * sit on a light page.
 */
export const DARK_MEDIA = `(prefers-color-scheme: dark) and (scripting: enabled)`

/**
 * The widths each screenshot is saved at, widest first, and the height at the widest. A desktop
 * shot's 800 px file is the one a phone at device scale 2 fetches for a picture as wide as the page.
 */
const SIZES: Record<ShotKind, { widths: readonly number[]; height: number }> = {
  desktop: { widths: [1280, 800, 640], height: 800 },
  mobile: { widths: [780, 390], height: 1688 },
}

/** The `srcset` of one theme of a screenshot, from the naming scheme of `static/shots/`. */
export function shotSrcset(name: string, theme: "light" | "dark", kind: ShotKind): string {
  return SIZES[kind].widths.map((width) => `/shots/${name}-${theme}-${width}.webp ${width}w`)
    .join(", ")
}

export interface ShotProps {
  /** The screenshot's name in `static/shots/`, such as `for-expats`. */
  name: string
  kind?: ShotKind
  /** The height at the widest width, for a picture cropped from its kind's viewport. */
  height?: number
  /** What the screen shows, for a reader who cannot see it. */
  alt: string
  /** How wide the image is drawn, for the browser's choice of file. */
  sizes?: string
  /** The largest image of the first screen: loaded at once and first. */
  priority?: boolean
  class?: string
}

/**
 * A screenshot of the product, light or dark as the page is (`DARK_MEDIA`), at the width the layout needs.
 * Sized by `width` and `height`, so nothing moves when it loads.
 */
export function Shot(
  {
    name,
    kind = "desktop",
    height = SIZES[kind].height,
    alt,
    sizes = "(min-width: 1024px) 1024px, 100vw",
    priority = false,
    class: className = "",
  }: ShotProps,
): JSX.Element {
  const [width] = SIZES[kind].widths
  return (
    <picture>
      <source
        media={DARK_MEDIA}
        srcset={shotSrcset(name, "dark", kind)}
        sizes={sizes}
      />
      <img
        src={`/shots/${name}-light-${width}.webp`}
        srcset={shotSrcset(name, "light", kind)}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        class={`block h-auto w-full ${className}`}
        {...(priority
          ? { fetchpriority: "high" as const, loading: "eager" as const }
          : { loading: "lazy" as const, decoding: "async" as const })}
      />
    </picture>
  )
}

/** A page's one phone-sized screenshot, cropped by `screenshots/capture.ts`. */
export interface PhoneShot {
  /** The screenshot's name in `static/shots/`. */
  name: string
  /** The height at the 780 px file: twice the crop's height in `screenshots/capture.ts`. */
  height: number
  /** What the screen shows, for a reader who cannot see it. */
  alt: string
  caption: string
}

/**
 * A phone-sized screenshot in the house frame with its caption under it, at most 390 px wide and
 * centred. Loaded at once, because on a phone it can be the largest element of the first screen.
 */
export function ShotFigure({ shot }: { shot: PhoneShot }): JSX.Element {
  return (
    <WindowFrame
      variant="plain"
      caption={shot.caption}
      class="mx-auto mt-4 w-full max-w-[390px]"
    >
      <div dir="ltr">
        <Shot
          name={shot.name}
          kind="mobile"
          height={shot.height}
          alt={shot.alt}
          sizes="(min-width: 430px) 390px, calc(100vw - 2rem)"
          priority
        />
      </div>
    </WindowFrame>
  )
}
