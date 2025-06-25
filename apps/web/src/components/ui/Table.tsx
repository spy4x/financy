import { ComponentChildren } from "preact"

interface Props {
  headerSlot: ComponentChildren
  bodySlots: ComponentChildren[]
}

export function Table({ headerSlot, bodySlots }: Props) {
  return (
    <div class="-mx-4 md:mx-0 bg-white ring-1 ring-gray-200 sm:rounded-lg pb-px scrollbar overflow-x-auto min-h-[300px]">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr class="*:whitespace-nowrap *:px-6 *:py-3 text-sm font-medium text-gray-900">
            {headerSlot}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 bg-white">
          {bodySlots.map((bodySlot, index) => (
            <tr key={index} class="text-sm *:px-6 *:py-4 hover:bg-gray-50">
              {bodySlot}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
