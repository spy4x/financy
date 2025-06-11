import { CopyButton } from "@web/components/ui/CopyButton.tsx"

export function UIGuideInputs() {
  return (
    <>
      <h2 class="border-b-1 pb-1 mb-4">Inputs</h2>
      <div class="flex flex-wrap items-start gap-5 lg:gap-x-20">
        <label class="label">
          <input
            type="checkbox"
            class="checkbox mr-2"
          />
          Checkbox
        </label>

        <fieldset>
          <div class="space-y-6 sm:flex sm:items-center sm:space-x-10 sm:space-y-0">
            <div class="flex items-center gap-2">
              <input
                id="email"
                name="notification-method"
                type="radio"
                checked
                class="radio"
              />
              <label for="email" class="label">
                Email
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                id="sms"
                name="notification-method"
                type="radio"
                class="radio"
              />
              <label for="sms" class="label">
                Phone (SMS)
              </label>
            </div>
            <div class="flex items-center gap-2">
              <input
                id="push"
                name="notification-method"
                type="radio"
                class="radio"
              />
              <label for="push" class="label">
                Push notification
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      <div class="flex flex-wrap items-start gap-2">
        <div class="w-60">
          <label class="label">
            Label name
          </label>
          <div class="mt-2">
            <input
              type="text"
              class="input"
              placeholder="With placeholder"
            />
            <p class="mt-2 text-sm text-gray-500">Help text if we need it.</p>
          </div>
        </div>
        <div class="w-60">
          <label class="label">
            Input with CopyButton
          </label>
          <div class="mt-2 relative">
            <input
              type="text"
              id="device-id"
              class="input pr-11"
            />
            <div class="absolute top-1.5 right-1.5">
              <CopyButton textToCopy="Text Example" />
            </div>
          </div>
        </div>
        <div class="w-60">
          <label class="label">
            Select
          </label>
          <div class="mt-2">
            <select
              id="role"
              class="input"
            >
              <option>One</option>
              <option>Two</option>
            </select>
          </div>
        </div>

        <div class="w-60">
          <label class="label">
            Textarea
          </label>
          <div class="mt-2">
            <textarea class="textarea" />
          </div>
        </div>
      </div>
    </>
  )
}
