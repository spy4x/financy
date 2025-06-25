import { useSignal } from "@preact/signals"
import { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

type Props = {
  /** Content to display as the trigger button */
  trigger: ComponentChildren
  /** CSS classes for the trigger button element */
  triggerClasses?: string
  /** CSS classes for the root container element */
  containerClasses?: string
  /** Additional CSS classes for the dropdown panel */
  panelClasses?: string
  /** Dropdown content */
  children: ComponentChildren
  /** Vertical position relative to trigger */
  vertical?: "up" | "down"
  /** Horizontal position relative to trigger */
  horizontal?: "left" | "right"
}

export function Dropdown(
  {
    trigger,
    triggerClasses,
    containerClasses,
    panelClasses,
    children,
    vertical = "down",
    horizontal = "right",
  }: Props,
) {
  const isOpen = useSignal(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
    ) {
      isOpen.value = false
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Build position classes based on vertical and horizontal props
  const verticalClass = vertical === "up" ? "bottom-full mb-2" : "top-full mt-2"
  const horizontalClass = horizontal === "left" ? "left-0" : "right-0"
  const originClass = vertical === "up"
    ? (horizontal === "left" ? "origin-bottom-left" : "origin-bottom-right")
    : (horizontal === "left" ? "origin-top-left" : "origin-top-right")

  return (
    <div class={`relative inline-block text-left ${containerClasses ?? ""}`} ref={dropdownRef}>
      <button
        onClick={() => isOpen.value = !isOpen.value}
        type="button"
        class={triggerClasses ?? "btn-input-icon"}
        aria-expanded="true"
        aria-haspopup="true"
      >
        {trigger}
      </button>
      <div
        class={`${
          !isOpen.value && "hidden"
        } absolute ${horizontalClass} z-10 whitespace-nowrap rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-hidden ${verticalClass} ${originClass} ${
          panelClasses ?? ""
        }`}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="menu-button"
      >
        {children}
      </div>
    </div>
  )
}
