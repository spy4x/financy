import { useSignal } from "@preact/signals"
import { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

type Props = {
  /** Content to display as the trigger button */
  trigger: ComponentChildren
  /** CSS classes for the trigger button element */
  triggerClasses?: string
  /** Data-e2e attribute for the trigger button */
  triggerDataE2E?: string
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
    triggerDataE2E,
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
    <div class={`relative inline-flex text-left ${containerClasses ?? ""}`} ref={dropdownRef}>
      <button
        onClick={() => isOpen.value = !isOpen.value}
        type="button"
        class={triggerClasses ?? "btn-input-icon"}
        data-e2e={triggerDataE2E}
        aria-expanded="true"
        aria-haspopup="true"
      >
        {trigger}
      </button>
      <div
        class={`${
          !isOpen.value && "hidden"
        } absolute ${horizontalClass} z-10 whitespace-nowrap rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5 dark:ring-gray-600 focus:outline-hidden ${verticalClass} ${originClass} ${
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
