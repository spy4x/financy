import { toast } from "./toast.ts"

export const clipboard = {
  copy: async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success({ body: "Text copied to clipboard" })
    } catch {
      toast.error({ body: "Failed to copy text to clipboard" })
    }
  },
}
