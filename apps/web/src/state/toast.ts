import { signal } from "@preact/signals"

export interface ToastBase {
  id?: string
  title?: string
  body: string
  type?: "success" | "error" | "info" | "warning"
  timeout?: number
}

export interface Toast extends Required<ToastBase> {}

const defaultTimeout = 5000

const list = signal<Toast[]>([])
function generateId(): string {
  return Math.random().toString(36).substring(7)
}

function add(toast: ToastBase): void {
  const id = toast.id ?? generateId()
  const type = toast.type ?? "info"
  const timeout = toast.timeout ?? defaultTimeout
  list.value = [...list.value, {
    id,
    title: toast.title ?? type.charAt(0).toUpperCase() + type.slice(1),
    body: toast.body,
    type,
    timeout,
  }]
  if (timeout) {
    setTimeout(() => remove(id), timeout)
  }
}
function remove(id: string): void {
  list.value = list.value.filter((toast) => toast.id !== id)
}

export const toast = {
  list: list,
  add,
  remove,
  info: (toast: ToastBase): void => add({ ...toast, type: "info" }),
  success: (toast: ToastBase): void => add({ ...toast, type: "success" }),
  error: (toast: ToastBase): void => add({ ...toast, type: "error" }),
  warning: (toast: ToastBase): void => add({ ...toast, type: "warning" }),
}
