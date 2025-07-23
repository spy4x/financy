import { auth } from "@web/state/auth.ts"
import { ws } from "@web/state/ws.ts"
import { category } from "@web/state/category.ts"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { group } from "@web/state/group.ts"
import { account } from "@web/state/account.ts"
import { transaction } from "@web/state/transaction.ts"
import { userSettings } from "@web/state/user-settings.ts"

let isInitialized = false

export function StateInit(
  _props: { ENV: string },
) {
  if (isInitialized) {
    return null
  }
  isInitialized = true
  // TODO: set url, ENV, WEB_API_PREFIX in states
  // if (!IS_BROWSER) return
  auth.init()
  currency.init()
  exchangeRate.init()
  category.init()
  group.init()
  account.init()
  transaction.init()
  userSettings.init()
  ws.init()
  return null
}
