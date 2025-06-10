import { IconClipboardCopy } from "@client/icons"
import { clipboard } from "@web/state/clipboard.ts"

interface Props {
  title?: string
  textToCopy: string
}

export function CopyButton({ title, textToCopy }: Props) {
  return (
    <button
      onClick={() => clipboard.copy(textToCopy)}
      class={title ? "btn btn-primary-outline" : "btn-input-icon"}
      type="button"
      title="Copy"
    >
      <IconClipboardCopy /> {title ? title : ""}
    </button>
  )
}
