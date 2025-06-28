import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"
import { useSignal, useSignalEffect } from "@preact/signals"
import { IconLoading } from "@client/icons"
import { Link, useRoute } from "wouter-preact"
import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { BudgetProgress } from "@web/components/ui/BudgetProgress.tsx"
import { navigate } from "@client/helpers"
import { routes } from "../_router.tsx"
import { formatCentsToInput, parseCurrencyInput } from "@shared/helpers/format.ts"
import { CategoryType, CategoryTypeUtils } from "@shared/types"

enum EditorState {
  INITIALIZING = "initializing",
  IDLE = "idle",
  IN_PROGRESS = "in_progress",
  SUCCESS = "success",
  ERROR = "error",
}

export function CategoryEditor() {
  const [match, params] = useRoute(routes.categories.children!.edit.href)
  const editCategoryId = match && params?.id ? parseInt(params.id) : null

  const name = useSignal("")
  const categoryType = useSignal<CategoryType>(CategoryType.EXPENSE)
  const monthlyLimit = useSignal("")
  const icon = useSignal("")
  const color = useSignal("")
  const error = useSignal("")
  const state = useSignal<EditorState>(EditorState.INITIALIZING)

  // Helper function for cleaner state checks
  const isState = (checkState: EditorState) => state.value === checkState

  // Initialize for edit mode
  useSignalEffect(() => {
    if (isState(EditorState.INITIALIZING)) {
      if (editCategoryId) {
        const existingCategory = category.list.value.find((c) => c.id === editCategoryId)
        if (existingCategory) {
          name.value = existingCategory.name
          categoryType.value = existingCategory.type || CategoryType.EXPENSE
          monthlyLimit.value = existingCategory.monthlyLimit
            ? formatCentsToInput(existingCategory.monthlyLimit)
            : ""
          icon.value = existingCategory.icon || ""
          color.value = existingCategory.color || ""
          error.value = ""
          state.value = EditorState.IDLE
        } else {
          error.value = "Category not found"
          state.value = EditorState.ERROR
        }
      } else {
        name.value = ""
        categoryType.value = CategoryType.EXPENSE
        monthlyLimit.value = ""
        icon.value = ""
        color.value = ""
        error.value = ""
        state.value = EditorState.IDLE
      }
    }
  })

  // Handle operation state changes and redirect
  useSignalEffect(() => {
    // Handle errors
    if (category.ops.create.value.error) {
      error.value = category.ops.create.value.error
      state.value = EditorState.ERROR
    } else if (category.ops.update.value.error) {
      error.value = category.ops.update.value.error
      state.value = EditorState.ERROR
    }

    // Track operation progress and handle completion
    if (isState(EditorState.IN_PROGRESS)) {
      const isCreateInProgress = category.ops.create.value.inProgress
      const isUpdateInProgress = category.ops.update.value.inProgress

      if (!isCreateInProgress && !isUpdateInProgress) {
        // Operation completed successfully
        if (!category.ops.create.value.error && !category.ops.update.value.error) {
          state.value = EditorState.SUCCESS
          navigate(routes.categories.href)
        }
      }
    }
  })

  function handleSubmit(e: Event) {
    e.preventDefault()
    const trimmedName = name.value.trim()
    if (!trimmedName) {
      error.value = "Category name is required"
      state.value = EditorState.ERROR
      return
    }

    const limitValue = monthlyLimit.value.trim()
    let limitInCents: number | null = null

    // Only process monthly limit for expense categories
    if (categoryType.value === CategoryType.EXPENSE && limitValue) {
      limitInCents = parseCurrencyInput(limitValue)
      if (limitInCents === null) {
        error.value = "Monthly limit must be a valid positive number"
        state.value = EditorState.ERROR
        return
      }
    }

    // For income categories, ensure monthlyLimit is undefined
    const finalMonthlyLimit = categoryType.value === CategoryType.INCOME ? undefined : limitInCents

    error.value = ""
    state.value = EditorState.IN_PROGRESS

    const iconValue = icon.value.trim() || null
    const colorValue = color.value.trim() || null

    if (editCategoryId) {
      category.update(
        editCategoryId,
        trimmedName,
        categoryType.value,
        finalMonthlyLimit,
        iconValue,
        colorValue,
      )
    } else {
      category.create(trimmedName, categoryType.value, finalMonthlyLimit, iconValue, colorValue)
    }
  }

  const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)

  return (
    <section class="page-layout">
      <PageTitle showGroupSelector>
        {editCategoryId ? "Categories - Edit" : "Categories - Create"}
      </PageTitle>

      {error.value && (
        <div class="mb-4 p-4 text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error.value}
        </div>
      )}

      <form onSubmit={handleSubmit} class="card">
        <fieldset disabled={isState(EditorState.IN_PROGRESS)}>
          <div class="card-body">
            <div class="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div class="sm:col-span-4">
                <label for="categoryName" class="label">
                  Name:
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="categoryName"
                    class="input"
                    placeholder="Enter category name"
                    value={name.value}
                    onInput={(e) => name.value = e.currentTarget.value}
                    required
                  />
                </div>
              </div>

              <div class="sm:col-span-2">
                <label for="categoryType" class="label">
                  Type:
                </label>
                <div class="mt-2">
                  <select
                    id="categoryType"
                    class="input"
                    value={categoryType.value}
                    onChange={(e) => {
                      const newType = parseInt(e.currentTarget.value) as CategoryType
                      categoryType.value = newType
                      // Clear monthly limit when switching to income type
                      if (newType === CategoryType.INCOME) {
                        monthlyLimit.value = ""
                      }
                    }}
                  >
                    <option value={CategoryType.EXPENSE}>
                      {CategoryTypeUtils.toString(CategoryType.EXPENSE)}
                    </option>
                    <option value={CategoryType.INCOME}>
                      {CategoryTypeUtils.toString(CategoryType.INCOME)}
                    </option>
                  </select>
                  <p class="mt-1 text-sm text-gray-600">
                    Choose whether this category is for expenses or income
                  </p>
                </div>
              </div>

              <div class="sm:col-span-3">
                <label for="categoryIcon" class="label">
                  Icon (Optional):
                </label>
                <div class="mt-2">
                  <input
                    type="text"
                    id="categoryIcon"
                    class="input"
                    placeholder="🛒 (emoji or icon)"
                    maxLength={10}
                    value={icon.value}
                    onInput={(e) => icon.value = e.currentTarget.value}
                  />
                  <p class="mt-1 text-sm text-gray-600">
                    Enter an emoji or icon name (max 10 characters)
                  </p>
                </div>
              </div>

              <div class="sm:col-span-3">
                <label for="categoryColor" class="label">
                  Color (Optional):
                </label>
                <div class="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    id="categoryColor"
                    class="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    value={color.value || "#3B82F6"}
                    onInput={(e) => color.value = e.currentTarget.value}
                  />
                  <input
                    type="text"
                    class="input flex-1"
                    placeholder="#3B82F6"
                    maxLength={7}
                    value={color.value}
                    onInput={(e) => color.value = e.currentTarget.value}
                  />
                </div>
                <p class="mt-1 text-sm text-gray-600">
                  Pick a color for visual organization
                </p>
              </div>

              <div class="sm:col-span-4">
                <label for="monthlyLimit" class="label">
                  Monthly Budget (Optional):
                  {categoryType.value === CategoryType.INCOME && (
                    <span class="text-gray-500 text-sm ml-1">
                      (Not applicable for income categories)
                    </span>
                  )}
                </label>
                <div class="mt-2">
                  <div class="flex items-center">
                    <span class="text-gray-500 mr-2">
                      {selectedGroup?.defaultCurrency || "USD"}
                    </span>
                    <input
                      type="number"
                      id="monthlyLimit"
                      class="input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={monthlyLimit.value}
                      onInput={(e) => monthlyLimit.value = e.currentTarget.value}
                      disabled={categoryType.value === CategoryType.INCOME}
                    />
                  </div>
                  <p class="mt-1 text-sm text-gray-600">
                    {categoryType.value === CategoryType.EXPENSE
                      ? "Set a default monthly spending limit for this category. This will be used as the starting budget for each month."
                      : "Income categories don't have spending limits."}
                  </p>
                  {editCategoryId && monthlyLimit.value && (
                    <div class="mt-3">
                      <label class="block text-sm font-medium text-gray-700 mb-2">
                        Current Month Progress:
                      </label>
                      <BudgetProgress
                        spentAmount={category.getMonthlySpent(editCategoryId)}
                        limitAmount={parseCurrencyInput(monthlyLimit.value || "0") || 0}
                        currency={selectedGroup?.defaultCurrency || "USD"}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <Link href={routes.categories.href} class="btn btn-link ml-auto">
              Cancel
            </Link>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={!name.value.trim()}
            >
              {isState(EditorState.IN_PROGRESS) && <IconLoading />}
              {editCategoryId ? "Update" : "Create"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
