import "./app.css"
import { Layout } from "./routes/_layout.tsx"
import { Router } from "./routes/_router.tsx"

export function App() {
  return (
    <Layout>
      <Router />
    </Layout>
  )
}
