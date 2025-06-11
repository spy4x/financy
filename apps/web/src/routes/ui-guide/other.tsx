import { Dropdown } from "@web/components/ui/Dropdown.tsx"
import { IconEllipsisVertical } from "@client/icons"

export function UIGuideOtherComponents() {
  return (
    <>
      <h2 class="border-b-1 pb-1 mb-4">Other components</h2>
      <div class="flex flex-wrap items-top gap-2">
        <div class="w-60">
          <label class="label">
            Card
          </label>
          <div class="mt-2 h-full">
            <div class="card h-24 flex justify-center items-center text-gray-600 text-xs">
              Example of .card
            </div>
          </div>
        </div>

        <div class="w-60">
          <label class="label">
            Dropdown
          </label>
          <div class="mt-2 card h-24 flex justify-center items-center">
            <Dropdown button={<IconEllipsisVertical />}>
              <div class="divide-y divide-gray-100">
                <div class="py-1" role="none">
                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </a>
                </div>
                <div class="py-1" role="none">
                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Metrics
                  </a>

                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Commands
                  </a>

                  <a
                    href="javascript:;"
                    class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Zones
                  </a>
                </div>
                <div class="py-1" role="none">
                  <button
                    type="button"
                    class="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span class="text-red-600">Delete</span>
                  </button>
                </div>
              </div>
            </Dropdown>
          </div>
          <div class="text-gray-600 text-xs p-1 flex">
            <span class="text-red-600 mr-1">*</span>
            <div>
              Dropdown should have
              <span class="text-purple-600 px-1">
                type="last"
              </span>
              if located in last 2 rows of table
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
