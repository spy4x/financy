import { ComponentChildren } from "preact"

interface Props {
  headerSlot: ComponentChildren
  bodySlots: ComponentChildren[]
  footerSlot?: ComponentChildren // Optional footer content
  rowDataE2E?: string // Optional data-e2e attribute for rows
}

export function Table({ headerSlot, bodySlots, footerSlot, rowDataE2E }: Props) {
  return (
    <div class="-mx-4 md:mx-0 bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-600 sm:rounded-lg pb-px scrollbar overflow-x-auto min-h-[300px]">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr class="*:whitespace-nowrap *:px-6 *:py-3 text-sm font-medium text-gray-900 dark:text-gray-200">
            {headerSlot}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-600 bg-white dark:bg-gray-800">
          {bodySlots.map((bodySlot, index) => (
            <tr
              key={index}
              class="text-sm *:px-6 *:py-4 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
              data-e2e={rowDataE2E}
            >
              {bodySlot}
            </tr>
          ))}
        </tbody>
        {footerSlot && (
          <tfoot class="bg-gray-50 dark:bg-gray-700">
            {footerSlot}
          </tfoot>
        )}
      </table>
    </div>
  )
}
