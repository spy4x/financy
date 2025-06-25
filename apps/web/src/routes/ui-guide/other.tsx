import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import {
  IconChevronDown,
  IconCog6Tooth,
  IconEllipsisVertical,
  IconTrashBin,
  IconUser,
} from "@client/icons"
import { useSignal } from "@preact/signals"

export function UIGuideOtherComponents() {
  const selectedAction = useSignal("Select action...")

  return (
    <>
      <h2 class="border-b-1 pb-1 mb-4">Other Components</h2>

      <div class="space-y-8">
        {/* Card Examples */}
        <div>
          <h3 class="text-lg font-medium mb-4">Cards</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="card h-24 flex justify-center items-center text-gray-600 text-sm">
              Basic Card
            </div>
            <div class="card">
              <div class="card-body">
                <h4 class="font-medium">Card with Body</h4>
                <p class="text-sm text-gray-600 mt-1">
                  This card uses the card-body class for proper padding.
                </p>
              </div>
            </div>
            <div class="card">
              <div class="card-header">
                <h4 class="font-medium">Card Header</h4>
              </div>
              <div class="card-body">
                <p class="text-sm text-gray-600">Card with header and body sections.</p>
              </div>
              <div class="card-footer">
                <button type="button" class="btn btn-primary btn-sm">Action</button>
              </div>
            </div>
          </div>
        </div>

        {/* Dropdown Examples */}
        <div>
          <h3 class="text-lg font-medium mb-4">Dropdown Component</h3>
          <p class="text-sm text-gray-600 mb-4">
            Updated with clearer prop names: <code>trigger</code>, <code>triggerClasses</code>,
            <code>containerClasses</code>, <code>panelClasses</code>, <code>vertical</code>, and
            {" "}
            <code>horizontal</code>.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Basic Dropdown */}
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Basic Menu</h4>
              <div class="card p-4 flex justify-center items-center">
                <Dropdown trigger={<IconEllipsisVertical class="size-5" />}>
                  <div class="divide-y divide-gray-100">
                    <div class="py-1" role="none">
                      <a
                        href="javascript:;"
                        class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <IconUser class="size-4 mr-2" />
                        View Profile
                      </a>
                      <a
                        href="javascript:;"
                        class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <IconCog6Tooth class="size-4 mr-2" />
                        Settings
                      </a>
                    </div>
                    <div class="py-1" role="none">
                      <button
                        type="button"
                        class="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                      >
                        <IconTrashBin class="size-4 mr-2" />
                        Delete
                      </button>
                    </div>
                  </div>
                </Dropdown>
              </div>
            </div>

            {/* Custom Button Dropdown */}
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Custom Trigger</h4>
              <div class="card p-4 flex justify-center items-center">
                <Dropdown
                  trigger={
                    <div class="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md hover:border-gray-400 transition-colors">
                      <span class="text-sm">{selectedAction.value}</span>
                      <IconChevronDown class="size-4" />
                    </div>
                  }
                  triggerClasses="w-full"
                  panelClasses="min-w-[200px]"
                >
                  <div class="divide-y divide-gray-100">
                    <div class="py-1">
                      {["Create new item", "Import data", "Export data", "Archive items"].map((
                        action,
                      ) => (
                        <button
                          key={action}
                          type="button"
                          class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 block"
                          onClick={() => selectedAction.value = action}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                </Dropdown>
              </div>
            </div>

            {/* Bottom Position Dropdown */}
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Bottom Position</h4>
              <div class="card p-4 flex justify-center items-center">
                <Dropdown
                  trigger={<IconEllipsisVertical class="size-5" />}
                  vertical="up"
                >
                  <div class="py-1">
                    <a
                      href="javascript:;"
                      class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Edit Item
                    </a>
                    <a
                      href="javascript:;"
                      class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Duplicate
                    </a>
                    <a
                      href="javascript:;"
                      class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Archive
                    </a>
                  </div>
                </Dropdown>
              </div>
              <p class="text-xs text-gray-600">
                Use <code>vertical="up"</code> for dropdowns in the last rows of tables
              </p>
            </div>

            {/* Horizontal Positioning */}
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Left-Aligned Dropdown</h4>
              <div class="card p-4 flex justify-center items-center">
                <Dropdown
                  trigger={<IconEllipsisVertical class="size-5" />}
                  horizontal="left"
                >
                  <div class="py-1">
                    <a
                      href="javascript:;"
                      class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Left Action 1
                    </a>
                    <a
                      href="javascript:;"
                      class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Left Action 2
                    </a>
                  </div>
                </Dropdown>
              </div>
              <p class="text-xs text-gray-600">
                Use <code>horizontal="left"</code> to align dropdowns to the left side
              </p>
            </div>
          </div>

          {/* Code Examples */}
          <div class="mt-6 p-4 bg-gray-50 rounded-md">
            <h4 class="text-sm font-medium text-gray-800 mb-3">Usage Examples</h4>
            <div class="space-y-3 text-xs font-mono">
              <div>
                <div class="text-gray-600 mb-1">Basic dropdown:</div>
                <code class="text-purple-600">
                  {"<Dropdown trigger={<IconEllipsisVertical />}>{/* menu items */}</Dropdown>"}
                </code>
              </div>
              <div>
                <div class="text-gray-600 mb-1">With custom styling:</div>
                <code class="text-purple-600">
                  {'<Dropdown trigger={button} triggerClasses="w-full" panelClasses="min-w-48" />'}
                </code>
              </div>
              <div>
                <div class="text-gray-600 mb-1">Positioned for table last rows:</div>
                <code class="text-purple-600">
                  {'<Dropdown trigger={<IconEllipsisVertical />} vertical="up" />'}
                </code>
              </div>
              <div>
                <div class="text-gray-600 mb-1">Left-aligned dropdown:</div>
                <code class="text-purple-600">
                  {'<Dropdown trigger={button} horizontal="left" />'}
                </code>
              </div>
            </div>
          </div>

          <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div class="text-sm">
              <span class="text-red-600 font-medium">*</span>
              <span class="text-yellow-800 ml-1">
                Use <code>vertical="up"</code>{" "}
                for dropdowns in the last 2 rows of tables to prevent clipping
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
