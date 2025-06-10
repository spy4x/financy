import { useSignal } from "@preact/signals"
// import { ErrorBoundary, LocationProvider, Route, Router } from "preact-iso"
import Router from "preact-router"

function Home({ path }: { path: string }) {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold">Home</h1>
        <p class="mt-4 text-lg">Welcome to the Home page of the SPA. {path}</p>
      </div>
    </div>
  )
}

function AboutUs({ path }: { path: string }) {
  const counter = useSignal(0)
  return (
    <div class="flex h-full w-full items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold">About Us</h1>
        <p class="mt-4 text-lg">Learn more about us on this page. {path}</p>
        <p>Counter component to test interactivity:</p>
        <button class="btn btn-primary mt-2" onClick={() => counter.value++} type="button">
          {counter.value}
        </button>
      </div>
    </div>
  )
}

function PrivacyPolicy({ id, path }: { id?: string; path?: string }) {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold">Privacy Policy</h1>
        <p class="mt-4 text-lg">This is the privacy policy page with ID: {id}</p>
        {path && <p class="mt-2 text-sm text-gray-500">Path: {path}</p>}
      </div>
    </div>
  )
}
function NotFound({ default: isDefault }: { default?: boolean }) {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold">404 - Not Found</h1>
        <p class="mt-4 text-lg">The page you are looking for does not exist.</p>
      </div>
    </div>
  )
}

export function Spa() {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <div class="text-center">
        <h1 class="text-2xl font-bold">SPA</h1>
        <p class="mt-4 text-lg">This is a Single Page Application (SPA) route.</p>
        <Router>
          <Home path="/app" />
          <AboutUs path="/app/about-us" />
          <PrivacyPolicy path="/app/privacy-policy/:id" />
          <NotFound default />
        </Router>
        <nav class="mt-4">
          <a href="/app" class="btn btn-link">Home</a>
          <a href="/app/about-us" class="btn btn-link">About Us</a>
          <a href="/app/privacy-policy/123" class="btn btn-link">Privacy Policy</a>
          <a href="/app/non-existent" class="btn btn-link">Non-existent Page</a>
        </nav>
      </div>
    </div>
  )

  /*
          <Route path="/" component={Home} />
          <Route path="/about-us" component={AboutUs} />
          <Route path="/privacy-policy/:id" component={PrivacyPolicy} />
          <Route default component={NotFound} />
        </Router>
        */
}
