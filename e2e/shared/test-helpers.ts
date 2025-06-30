/**
 * E2E Test Helpers
 *
 * Entity-based helper functions for E2E tests with optimized structure.
 */

import { type Locator, type Page } from "@playwright/test"

// Base helper function for locators
export const sel = (p: Page, selector: string): Locator => p.locator(selector)

// Text-based locator helper
export const eText = (p: Page, selector: string, text: string): Locator =>
  sel(p, `${selector}:has-text("${text}")`)

// Role-based locator helper
export const role = (
  p: Page,
  roleName: string,
  options?: { name?: string | RegExp; exact?: boolean },
): Locator =>
  p.getByRole(
    roleName as "button" | "link" | "textbox" | "combobox" | "radio" | "spinbutton",
    options,
  )

// Transaction entity helpers
export const transaction = {
  selectors: {
    row: "tr:has(td)",
    submitButton: "button[type='submit']",
  },
  nav: {
    create: (p: Page) => role(p, "link", { name: "Create" }).click(),
    list: (p: Page) => p.goto("http://mk.localhost/transactions"),
  },
  form: {
    fillAmount: (p: Page, amount: string) =>
      role(p, "spinbutton", { name: "Amount:" }).fill(amount),
    fillMemo: (p: Page, memo: string) =>
      role(p, "textbox", { name: "Memo (optional):" }).fill(memo),
    fillTimestamp: (p: Page, timestamp: string) =>
      role(p, "textbox", { name: "Date & Time:" }).fill(timestamp),
    selectCategory: (p: Page, category: string) =>
      role(p, "combobox", { name: "Category:" }).selectOption({ label: category }),
    selectAccount: (p: Page, account: string) =>
      role(p, "combobox", { name: "Account:" }).selectOption({ label: account }),
    selectFromAccount: (p: Page, account: string) =>
      sel(p, "#fromAccount").selectOption({ label: account }),
    selectToAccount: (p: Page, account: string) =>
      sel(p, "#toAccount").selectOption({ label: account }),
    submit: (p: Page) => role(p, "button", { name: "Create" }).click(),
  },
  radio: {
    expenseType: (p: Page) => role(p, "radio", { name: "Debit (Money Out)" }),
    incomeType: (p: Page) => role(p, "radio", { name: "Credit (Money In)" }),
    transferType: (p: Page) => role(p, "radio", { name: "Transfer (Between Accounts)" }),
  },
  actions: {
    openDropdown: (p: Page, memo: string) =>
      eText(p, transaction.selectors.row, memo).locator("button").first().click(),
    edit: (p: Page) => p.getByText("Edit").click(),
    delete: (p: Page) => p.getByText("Delete").click(),
  },
  combo: {
    fromAccount: (p: Page) => sel(p, "#fromAccount"),
    toAccount: (p: Page) => sel(p, "#toAccount"),
  },
}

// Group entity helpers
export const group = {
  selectors: {
    row: "tr:has(td)",
    memberRow: "tr:has(td)",
    memberEmailInput: "member-email-input",
    memberRoleSelect: "member-role-select",
    addMemberButton: "add-member-button",
  },
  nav: {
    create: (p: Page) => role(p, "link", { name: "Create" }).click(),
    list: (p: Page) => p.goto("http://mk.localhost/groups"),
    members: async (p: Page, groupName: string) => {
      await group.actions.openDropdown(p, groupName)
      await p.getByText("Members").click()
    },
  },
  form: {
    fillName: (p: Page, name: string) => role(p, "textbox", { name: "Group Name:" }).fill(name),
    selectCurrency: async (p: Page, currencyCode: string) => {
      await role(p, "button", { name: "Currency:" }).click()
      await role(p, "button", { name: new RegExp(currencyCode, "i") }).click()
    },
    submit: (p: Page) => role(p, "button", { name: "Create" }).click(),
    update: (p: Page) => role(p, "button", { name: "Update" }).click(),

    // Member management form helpers
    fillMemberEmail: (p: Page, email: string) =>
      sel(p, `[data-e2e="${group.selectors.memberEmailInput}"]`).fill(email),
    selectMemberRole: (p: Page, role: string) =>
      sel(p, `[data-e2e="${group.selectors.memberRoleSelect}"]`).selectOption(role),
    addMember: (p: Page) => sel(p, `[data-e2e="${group.selectors.addMemberButton}"]`).click(),
  },
  actions: {
    openDropdown: (p: Page, groupName: string) =>
      sel(p, "tr").filter({ hasText: groupName }).locator("button").last().click(),
    edit: (p: Page) => p.getByText("Edit").click(),
    delete: (p: Page) => p.getByText("Delete").click(),
    selectGroup: (p: Page) => p.getByText("Select Group").click(),
  },
}
