import { test, expect, Page } from "@playwright/test"

const BASE = 'https://financy.dev'
const USERNAME = 'testuser123'
const PASS = 'testpass123'

test.describe('Multi-Currency Decimal Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    
    // Fill in username and password on the login page
    await page.fill('input[type="text"], input[id="login"]', USERNAME)
    await page.fill('input[type="password"]', PASS)
    
    // Click sign in button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
      page.click('button:has-text("Sign in")'),
    ])
    
    // Wait for dashboard to load
    await page.waitForSelector('text=Dashboard', { timeout: 10000 }).catch(() => {})
  })

  async function safeDeleteAccount(page: Page, name: string) {
    const row = page.locator('tr', { hasText: name })
    if (await row.count()) {
      const del = row.locator('button:has-text("Delete"), button[aria-label="Delete"]')
      if (await del.count()) {
        await del.first().click()
        // confirm
        const confirm = page.locator('button:has-text("Confirm"), button:has-text("Delete account")')
        if (await confirm.count()) await confirm.first().click()
        await page.waitForTimeout(500)
      }
    }
  }

  async function createAccount(page: Page, name: string, currency: string, starting: string) {
    // ensure no duplicate
    await safeDeleteAccount(page, name)
    await page.click('button[data-e2e="create-account"], button:has-text("New account"), button:has-text("Create account")')
    await page.fill('input[name="name"]', name)
    // currency select
    const sel = page.locator('select[name="currency"], select[aria-label="Currency"]')
    if (await sel.count()) {
      await sel.selectOption({ value: currency, label: currency })
    } else {
      await page.fill('input[aria-label="Currency"], input[name="currency"]', currency)
    }
    // starting balance
    const bal = page.locator('input[name="startingBalance"], input[name="balance"], input[aria-label="Starting balance"]')
    if (await bal.count()) await bal.fill(starting)
    await Promise.all([
      page.waitForResponse((r: any) => r.url().includes('/api/accounts') && r.status() === 201).catch(() => null),
      page.click('button:has-text("Save"), button:has-text("Create")')
    ])
    await expect(page.locator('tr', { hasText: name })).toBeVisible()
  }

  async function createTransaction(page: Page, accountName: string, type: 'income'|'expense', amount: string, description = 'e2e') {
    await page.click('button[data-e2e="create-transaction"], button:has-text("New transaction")')
    // select account
    const acc = page.locator('select[name="account"], select[aria-label="Account"]')
    if (await acc.count()) await acc.selectOption({ label: accountName })
    // type
    const tsel = page.locator('select[name="type"], select[aria-label="Type"]')
    if (await tsel.count()) await tsel.selectOption(type)
    // amount
    await page.fill('input[name="amount"], input[aria-label="Amount"]', amount)
    await page.fill('input[name="description"], textarea[name="description"]', description)
    await Promise.all([
      page.waitForResponse((r: any) => r.url().includes('/api/transactions') && (r.status() === 201 || r.status() === 200)).catch(() => null),
      page.click('button:has-text("Save"), button:has-text("Create transaction"), button:has-text("Add")')
    ])
    await page.waitForTimeout(500)
  }

  function fmt(currency: string, amount: number) {
    const opts: any = { style: 'currency', currency }
    if (currency === 'JPY') opts.maximumFractionDigits = 0
    return new Intl.NumberFormat('en-US', opts).format(amount)
  }

  test('JPY account with 0 decimals displays correctly', async ({ page }) => {
    const name = 'JPY Test'
    await createAccount(page, name, 'JPY', '100000')
    // account balance should show ¥100,000
    const row = page.locator('tr', { hasText: name })
    const balEl = row.locator('[data-e2e="account-balance"], .balance, .AccountBalance')
    await expect(balEl).toBeVisible()
    const text = (await balEl.first().innerText()).trim()
    expect(text).toBe(fmt('JPY', 100000))

    // total balance should be roughly $923 (not $92,359)
    const totalEl = page.locator('[data-e2e="total-balance"], [aria-label="Total balance"], .total-balance')
    await expect(totalEl).toBeVisible()
    const tot = (await totalEl.first().innerText())
    const digits = parseFloat(tot.replace(/[^0-9.\-]/g, ''))
    expect(digits).toBeGreaterThan(800)
    expect(digits).toBeLessThan(1100)

    await safeDeleteAccount(page, name)
  })

  test('USD transaction displays with 2 decimals', async ({ page }) => {
    const name = 'USD Txn Test'
    await createAccount(page, name, 'USD', '0')
    await createTransaction(page, name, 'income', '5000.00')

    const row = page.locator('tr', { hasText: name })
    const balEl = row.locator('[data-e2e="account-balance"], .balance, .AccountBalance')
    await expect(balEl).toBeVisible()
    const balText = (await balEl.first().innerText()).trim()
    expect(balText).toBe(fmt('USD', 5000))

    // transaction amount visible exact
    await expect(page.locator(`text=${fmt('USD', 5000)}`)).toBeVisible()

    await safeDeleteAccount(page, name)
  })

  test('JPY transaction displays with 0 decimals', async ({ page }) => {
    const name = 'JPY Txn Test'
    await createAccount(page, name, 'JPY', '0')
    await createTransaction(page, name, 'expense', '10000')

    const row = page.locator('tr', { hasText: name })
    const balEl = row.locator('[data-e2e="account-balance"], .balance, .AccountBalance')
    await expect(balEl).toBeVisible()
    const balText = (await balEl.first().innerText()).trim()
    expect(balText).toBe(fmt('JPY', -10000))

    await expect(page.locator(`text=${fmt('JPY', -10000)}`)).toBeVisible()
    await safeDeleteAccount(page, name)
  })

  test('EUR transaction displays with 2 decimals', async ({ page }) => {
    const name = 'EUR Txn Test'
    await createAccount(page, name, 'EUR', '0')
    await createTransaction(page, name, 'income', '2000.00')

    const row = page.locator('tr', { hasText: name })
    const balEl = row.locator('[data-e2e="account-balance"], .balance, .AccountBalance')
    await expect(balEl).toBeVisible()
    const balText = (await balEl.first().innerText()).trim()
    expect(balText).toBe(fmt('EUR', 2000))

    await expect(page.locator(`text=${fmt('EUR', 2000)}`)).toBeVisible()
    await safeDeleteAccount(page, name)
  })
})
