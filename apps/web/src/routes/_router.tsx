import { Route, Switch } from "wouter-preact"
import { FunctionalComponent } from "preact"
import { Profile } from "../routes/profile/page.tsx"
import { Error404 } from "../routes/_404.tsx"
import { UIGuide } from "../routes/ui-guide/+page.tsx"
import { CategoryList } from "./categories/list.tsx"
import { CategoryEditor } from "./categories/editor.tsx"
import { GroupList } from "./groups/list.tsx"
import { GroupEditor } from "./groups/editor.tsx"
import { AccountList } from "./accounts/list.tsx"
import { AccountEditor } from "./accounts/editor.tsx"
import { TransactionList } from "./transactions/list.tsx"
import { TransactionEditor } from "./transactions/editor.tsx"

type Route = {
  title: string
  href: string
  component: FunctionalComponent
  children?: Record<string, Route>
}

export type Routes = Record<string, Route>

export const routes = {
  dashboard: {
    title: "Dashboard",
    href: "/",
    component: Error404, // Placeholder for the dashboard component
  },
  groups: {
    title: "Groups",
    href: "/groups",
    component: GroupList,
    children: {
      create: {
        title: "Groups - Create",
        href: "/groups/create",
        component: GroupEditor,
      },
      edit: {
        title: "Groups - Edit",
        href: "/groups/:id",
        component: GroupEditor,
      },
    },
  },
  categories: {
    title: "Categories",
    href: "/categories",
    component: CategoryList,
    children: {
      create: {
        title: "Categories - Create",
        href: "/categories/create",
        component: CategoryEditor,
      },
      edit: {
        title: "Categories - Edit",
        href: "/categories/:id",
        component: CategoryEditor,
      },
    },
  },
  accounts: {
    title: "Accounts",
    href: "/accounts",
    component: AccountList,
    children: {
      create: {
        title: "Accounts - Create",
        href: "/accounts/create",
        component: AccountEditor,
      },
      edit: {
        title: "Accounts - Edit",
        href: "/accounts/:id",
        component: AccountEditor,
      },
    },
  },
  transactions: {
    title: "Transactions",
    href: "/transactions",
    component: TransactionList,
    children: {
      create: {
        title: "Transactions - Create",
        href: "/transactions/create",
        component: TransactionEditor,
      },
      edit: {
        title: "Transactions - Edit",
        href: "/transactions/:id",
        component: TransactionEditor,
      },
    },
  },
  profile: {
    title: "Profile",
    href: "/profile",
    component: Profile,
  },
  uiGuide: {
    title: "UI Guide",
    href: "/ui-guide",
    component: UIGuide,
  },
  notFound: {
    title: "404 - Not Found",
    href: "/404",
    component: Error404,
  },
} as const satisfies Routes

// Helper to flatten routes into a list, with children first (more specific first)
function flattenRoutes(routeObj: Record<string, Route>): Route[] {
  const result: Route[] = []
  function walk(route: Route): void {
    if ("children" in route && route.children) {
      Object.values(route.children).forEach((child) => walk(child))
    }
    result.push(route)
  }
  Object.values(routeObj).forEach(walk)
  return result
}

export function Router() {
  // Flatten and sort routes by path length descending (more specific first)
  const flatRoutes = flattenRoutes(routes).sort((a, b) => b.href.length - a.href.length)
  return (
    <Switch>
      {flatRoutes.map((route, i) => (
        <Route key={route.href + i} path={route.href} component={route.component} />
      ))}
      <Route>
        {routes.notFound.component}
      </Route>
    </Switch>
  )
}
