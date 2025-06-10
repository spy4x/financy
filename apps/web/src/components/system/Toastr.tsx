import { IconCheck, IconExclamationTriangle, IconInformationCircle, IconXMark } from "@client/icons"
import { toast } from "@web/state/toast.ts"

export function Toastr() {
  const bgColor = {
    "success": "bg-green-700",
    "error": "bg-red-600",
    "info": "bg-blue-700",
    "warning": "bg-yellow-700",
  }
  return (
    <>
      {toast.list.value.length
        ? (
          <div
            data-e2e="toastr"
            class="fixed top-8 right-8 w-full max-w-xs md:max-w-sm z-50 space-y-4"
          >
            {toast.list.value.map((t) => (
              <div
                key={t.id}
                class={`${bgColor[t.type]} rounded-lg py-4 px-6 space-y-4 text-white`}
              >
                <div class="flex justify-between">
                  {/* <p class="text-sm font-semibold">{toast.title}</p> */}

                  <p class="text-sm flex gap-2">
                    {t.type === "success"
                      ? <IconCheck class="size-5" />
                      : t.type === "error"
                      ? <IconExclamationTriangle class="size-5" />
                      : t.type === "info"
                      ? <IconInformationCircle class="size-5" />
                      : t.type === "warning"
                      ? <IconExclamationTriangle class="size-5" />
                      : null}
                    {t.body}
                  </p>
                  <button onClick={() => toast.remove(t.id)}>
                    <IconXMark class="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
        : null}
    </>
  )
}
