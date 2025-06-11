import { Route, Switch } from "wouter-preact"
import { FunctionalComponent } from "preact"
import { Profile } from "../routes/profile/page.tsx"
import { Error404 } from "../routes/_404.tsx"
import { UIGuide } from "../routes/ui-guide/+page.tsx"

type Route = {
  title: string
  href: string
  component: FunctionalComponent
  children?: Record<string, Route>
}

export type Routes = Record<string, Route>

import { TodoList } from "./todos/index.tsx"
import { TodoEditor } from "./todos/[id].tsx"

export const routes = {
  dashboard: {
    title: "Dashboard",
    href: "/",
    component: Error404, // Placeholder for the dashboard component
  },
  profile: {
    title: "Profile",
    href: "/profile",
    component: Profile,
  },
  todos: {
    title: "Todos",
    href: "/todos",
    component: TodoList,
    children: {
      detail: {
        title: "Todo Editor",
        href: "/todos/:id",
        component: TodoEditor,
      },
    },
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
