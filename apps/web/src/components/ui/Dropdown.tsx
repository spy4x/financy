import { useSignal } from "@preact/signals"
import { ComponentChildren } from "preact"
import { useEffect, useRef } from "preact/hooks"

type Props = {
  button: ComponentChildren
  buttonClass?: string
  extraClass?: string
  children: ComponentChildren
  type?: string
}

export function Dropdown({ button, buttonClass, extraClass, children, type }: Props) {
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

  const defaultClass = "origin-top-right top-full mt-2"
  const conditionClass = type === "last" ? "origin-bottom-right bottom-full mb-2" : defaultClass

  return (
    <div class="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => isOpen.value = !isOpen.value}
        type="button"
        class={buttonClass ?? "btn-input-icon"}
        aria-expanded="true"
        aria-haspopup="true"
      >
        {button}
      </button>
      <div
        class={`${
          !isOpen.value && "hidden"
        } absolute right-0 z-10 whitespace-nowrap rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-hidden ${conditionClass} ${extraClass}`}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="menu-button"
      >
        {children}
      </div>
    </div>
  )
}
