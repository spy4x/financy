// The sections of a long reading page, such as a feature page or a comparison: an `h2` with a link
// to itself, and the section it labels.
import type { ComponentChildren, JSX } from "preact"
import { useSite } from "../use-site.tsx"

/** A section's `h2`: wraps and hyphenates instead of overflowing a phone's width. */
export const HEADING =
  `scroll-mt-16 text-2xl font-semibold tracking-tight text-balance break-words hyphens-auto`

/** A link alone on its line, with a 44 px touch target. */
export const LINK =
  `inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline`

/** A section's `h2`, with a "Link to this section" link shown on hover and on focus. */
export function SectionHeading(
  { id, children }: { id: string; children: ComponentChildren },
): JSX.Element {
  const { t } = useSite()
  return (
    <div class="group/heading flex items-baseline gap-2">
      <h2 id={`${id}-title`} class={HEADING}>{children}</h2>
      <a
        href={`#${id}`}
        aria-label={t.t(`FeaturePage.sectionLink`)}
        class="rounded-sm px-1 text-muted opacity-0 group-hover/heading:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus [@media(hover:none)]:opacity-100"
      >
        <span aria-hidden="true">#</span>
      </a>
    </div>
  )
}

/** One section of the page, labelled by its heading. */
export function Section(
  { id, label, children }: { id: string; label: string; children: ComponentChildren },
): JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-title`} class="flex scroll-mt-16 flex-col gap-4">
      <SectionHeading id={id}>{label}</SectionHeading>
      {children}
    </section>
  )
}
