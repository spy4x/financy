import { Table } from "@web/components/ui/Table.tsx"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"

export function UIGuideTable() {
  // Sample data for demonstration
  const sampleTransactions = [
    {
      id: 1,
      date: "2025-06-25",
      merchant: "Coffee & Co",
      category: "Food & Dining",
      account: "Chase Checking",
      originalAmount: -450,
      originalCurrency: "USD",
      convertedAmount: -450,
      convertedCurrency: "USD",
      status: "Completed",
      reference: "TXN-2025-001234",
    },
    {
      id: 2,
      date: "2025-06-24",
      merchant: "Salary Transfer",
      category: "Income",
      account: "Savings Account",
      originalAmount: 450000,
      originalCurrency: "USD",
      convertedAmount: 375000,
      convertedCurrency: "EUR",
      status: "Completed",
      reference: "TXN-2025-001235",
    },
    {
      id: 3,
      date: "2025-06-23",
      merchant: "Amazon Purchase",
      category: "Shopping",
      account: "Credit Card",
      originalAmount: -12999,
      originalCurrency: "USD",
      convertedAmount: -10829,
      convertedCurrency: "EUR",
      status: "Pending",
      reference: "TXN-2025-001236",
    },
    {
      id: 4,
      date: "2025-06-22",
      merchant: "Uber Ride",
      category: "Transportation",
      account: "Chase Checking",
      originalAmount: -1850,
      originalCurrency: "USD",
      convertedAmount: -1542,
      convertedCurrency: "EUR",
      status: "Completed",
      reference: "TXN-2025-001237",
    },
  ]

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
          bodySlots
        </span>
        . Tables are horizontally scrollable on mobile when content overflows.
      </p>

      {/* Mobile-first responsive table with many columns */}
      <div class="overflow-x-auto">
        <Table
          headerSlot={
            <>
              <th class="text-left whitespace-nowrap" scope="col">Date</th>
              <th class="text-left whitespace-nowrap" scope="col">Merchant</th>
              <th class="text-left whitespace-nowrap" scope="col">Category</th>
              <th class="text-left whitespace-nowrap" scope="col">Account</th>
              <th class="text-right whitespace-nowrap" scope="col">Original Amount</th>
              <th class="text-right whitespace-nowrap" scope="col">Converted Amount</th>
              <th class="text-center whitespace-nowrap" scope="col">Status</th>
              <th class="text-left whitespace-nowrap" scope="col">Reference</th>
              <th class="text-right whitespace-nowrap" scope="col">Actions</th>
            </>
          }
          bodySlots={sampleTransactions.map((txn) => (
            <>
              <td class="text-gray-900 whitespace-nowrap font-medium">
                {new Date(txn.date).toLocaleDateString()}
              </td>
              <td class="text-gray-900 whitespace-nowrap">
                <div class="font-medium">{txn.merchant}</div>
              </td>
              <td class="text-gray-600 whitespace-nowrap">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {txn.category}
                </span>
              </td>
              <td class="text-gray-900 whitespace-nowrap">
                {txn.account}
              </td>
              <td class="text-right whitespace-nowrap">
                <CurrencyDisplay
                  amount={txn.originalAmount}
                  currency={txn.originalCurrency}
                  highlightNegative
                />
              </td>
              <td class="text-right whitespace-nowrap">
                <CurrencyDisplay
                  amount={txn.convertedAmount}
                  currency={txn.convertedCurrency}
                  highlightNegative
                />
              </td>
              <td class="text-center whitespace-nowrap">
                <span
                  class={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    txn.status === "Completed"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {txn.status}
                </span>
              </td>
              <td class="text-gray-500 whitespace-nowrap font-mono text-xs">
                {txn.reference}
              </td>
              <td class="text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-2">
                  <a
                    href="javascript:;"
                    class="btn-link text-xs"
                  >
                    View
                  </a>
                  <a
                    href="javascript:;"
                    class="btn-link text-xs"
                  >
                    Edit
                  </a>
                </div>
              </td>
            </>
          ))}
        />
      </div>

      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <h4 class="text-sm font-medium text-blue-800 mb-2">Mobile Responsiveness</h4>
        <p class="text-sm text-blue-700">
          This table demonstrates horizontal scrolling on mobile devices when content exceeds the
          viewport width. The table includes many columns with real-world financial data including
          dates, amounts, categories, and status indicators.
        </p>
      </div>
    </div>
  )
}
