import { clipboard } from "@web/state/clipboard.ts"
import * as icons from "@client/icons"
import { useSignal } from "@preact/signals"

export function UIGuideIcons() {
  const iconSearch = useSignal("")
  return (
    <div>
      <div class="flex items-center justify-between gap-6 border-b-1 mb-4">
        <h2>Icons</h2>
        <span class="text-sm text-gray-500">
          Click on an icon to copy it
        </span>
        <div class="relative w-60 my-3">
          <input
            class="input w-full pr-10"
            placeholder="Search icons"
            value={iconSearch}
            onInput={(e) => iconSearch.value = e.currentTarget.value}
          />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <icons.IconSearch class="size-5 text-gray-600" />
          </span>
        </div>
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        {Object.entries(icons).filter(
          ([name]) =>
            name.toLowerCase().includes(
              iconSearch.value.toLowerCase(),
            ),
        ).map(([name, Icon]) => (
          <button
            title={`Copy <${name} />`}
            onClick={() => clipboard.copy(`<${name} />`)}
            type="button"
            class="text-gray-600"
          >
            <div class="card flex items-center justify-center w-32 h-20 hover:cursor-pointer group">
              <Icon class="size-6 group-hover:scale-125 transition-transform duration-300" />
            </div>
            <span class="text-xs mt-2">
              {name.replace(/^Icon/, "")}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
