import { Table } from "@web/components/ui/Table.tsx"

export function UIGuideTable() {
  return (
    <div>
      <h2 class="border-b-1 pb-1 mb-4">Table</h2>
      <p class="mb-4">
        Use component
        <span class="mx-2 border border-purple-600 text-purple-600 text-sm py-0.5 px-1.5 rounded-primary">
          Table
        </span>
        with
        <span class="text-purple-600 text-sm py-0.5 px-1.5">
          headerSlot
        </span>
        and
        <span class="text-purple-600 text-sm py-0.5 px-1.5">
          bodySlot
        </span>
      </p>
      <Table
        headerSlot={
          <>
            <th class="text-left" scope="col">Name</th>
            <th class="text-right" scope="col">Actions</th>
          </>
        }
        bodySlots={[
          (
            <>
              <td class="text-gray-900">
                <a
                  href="javascript:;"
                  class="hover:underline"
                >
                  Name
                </a>
              </td>
              <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right sm:pr-6">
                <a
                  href="javascript:;"
                  class="btn-link"
                >
                  Edit
                </a>
              </td>
            </>
          ),
        ]}
      />
    </div>
  )
}
