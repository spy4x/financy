import { useLocation } from "wouter-preact"
import { group } from "../../../state/group.ts"
import { IconChartPie, IconHome, IconPlus } from "@client/icons"

export function QuickActionsPanel() {
  const [, navigate] = useLocation()

  const actions = [
    {
      title: "Add Transaction",
      description: "Record expense or income",
      icon: IconPlus,
      href: "/transactions/create",
      primary: true,
    },
    {
      title: "Add Account",
      description: "Create new account",
      icon: IconHome,
      href: "/accounts/create",
      primary: false,
    },
    {
      title: "Add Category",
      description: "Create new category",
      icon: IconChartPie,
      href: "/categories/create",
      primary: false,
    },
  ]

  const handleActionClick = (href: string) => {
    if (!group.selectedId.value) {
      return // Disabled state, do nothing
    }
    navigate(href)
  }

  const isDisabled = !group.selectedId.value

  return (
    <div>
      <h2 class="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
      <div class="card">
        <div class="card-body">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {actions.map((action, index) => {
              const Icon = action.icon
              const buttonClass = `
                btn flex flex-col items-center gap-2 p-4 h-auto min-h-[120px]
                ${
                action.primary
                  ? (isDisabled ? "btn-disabled cursor-not-allowed" : "btn-primary")
                  : (isDisabled ? "btn-disabled cursor-not-allowed" : "btn-primary-outline")
              }
              `.trim()

              return (
                <button
                  key={index}
                  type="button"
                  class={buttonClass}
                  onClick={() => handleActionClick(action.href)}
                  disabled={isDisabled}
                  title={isDisabled ? "Please select a group first" : action.description}
                >
                  <Icon class="size-8" />
                  <div class="text-center">
                    <div class="text-sm font-medium">
                      {action.title}
                    </div>
                    <div class="text-xs opacity-75 mt-1">
                      {action.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {isDisabled && (
            <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p class="text-sm text-yellow-800">
                Please select a group from the navigation menu to enable quick actions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
