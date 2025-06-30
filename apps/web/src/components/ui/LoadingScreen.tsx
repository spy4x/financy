import { IconLoading } from "@client/icons"

interface Props {
  message?: string
}

export function LoadingScreen({ message = "Loading..." }: Props) {
  return (
    <div class="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center z-50">
      <div class="text-center">
        <div class="mb-4">
          <IconLoading class="size-12 text-blue-600 dark:text-blue-400 mx-auto" />
        </div>
        <div class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          {message}
        </div>
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Syncing your financial data...
        </div>
      </div>
    </div>
  )
}
