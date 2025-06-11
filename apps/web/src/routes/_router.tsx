import { Route, Switch } from "wouter-preact"
import { Profile } from "./profile/page.tsx"
import { UIGuide } from "./ui-guide/+page.tsx"

export function Router() {
  return (
    <Switch>
      <Route path="/profile" component={Profile} />
      <Route path="/ui-guide" component={UIGuide} />
      <Route>
        <div class="text-center py-8">
          <h2 class="text-2xl font-semibold text-red-600 mb-2">404 - Not Found</h2>
          <p class="text-gray-600">Page not found.</p>
        </div>
      </Route>
    </Switch>
  )
}
