import { IconArrowLeft, IconLoading, IconPencilSquare, IconPlus } from "@client/icons"
import { CopyButton } from "@web/components/ui/CopyButton.tsx"
import { navigate } from "@client/helpers"

export function UIGuideButtons() {
  return (
    <>
      <h2 class="border-b-1 pb-1 mb-4">Buttons</h2>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary">Primary</button>
        <button type="button" class="btn btn-primary-outline">
          Outline
        </button>
        <button type="button" class="btn btn-danger">Danger</button>
        <button type="button" class="btn btn-danger-outline">
          Outline
        </button>
        <button type="button" class="btn btn-warning">Warning</button>
        <button type="button" class="btn btn-warning-outline">
          Outline
        </button>
        <button type="button" class="btn btn-success">Success</button>
        <button type="button" class="btn btn-success-outline">
          Outline
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn btn-primary btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-primary-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-danger btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-danger-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-success btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button type="button" class="btn btn-success-outline btn-icon">
          <IconPlus class="size-6" />
        </button>
        <button
          type="button"
          class="btn btn-primary transition ease-in-out duration-150 cursor-not-allowed"
        >
          <IconLoading class="animate-spin -ml-1 mr-1 size-5 text-white" /> Processing...
        </button>
        <div>
          <a href="javascript:;" class="btn-link">
            <IconPencilSquare /> Link
          </a>
        </div>
        <CopyButton
          title="Copy button example"
          textToCopy="Why did the developer go broke? Because he used up all his cache!"
        />
        <button
          title="To homepage"
          onClick={() => navigate("/")}
          class="btn btn-primary-outline"
          type="button"
        >
          <IconArrowLeft class="size-6" />
          <span>Navigation</span>
        </button>
      </div>
    </>
  )
}
