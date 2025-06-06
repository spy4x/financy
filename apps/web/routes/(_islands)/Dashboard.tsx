import { navigate } from "@client/helpers"

export function Dashboard() {
  return (
    <div class="flex min-h-dvh flex-col justify-center px-6 lg:px-8">
      <h1 class="text-center mt-10 mb-5 lg:mt-20 lg:mb-10">
        <span class="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-purple-950">
          SmartLite Dashboard
        </span>
      </h1>
      <div class="mx-auto w-full max-w-md">
        <p class="text-center">Welcome to the SmartLite Dashboard!</p>
        <button onClick={() => navigate("/profile")} class="btn btn-primary mt-5" type="button">
          Navigate to /profile
        </button>
      </div>
    </div>
  )
}
