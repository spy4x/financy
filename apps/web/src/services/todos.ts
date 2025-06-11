import { effect, signal } from "@preact/signals"
import { makeStorage } from "@shared/local-storage"

export type Todo = {
  id: number
  text: string
  completed: boolean
}

// Global signals for todos and nextId
const storage = makeStorage<Todo[]>(localStorage, "todos")
export const todosSignal = signal<Todo[]>(storage.get() || [])
effect(() => storage.set(todosSignal.value))
let nextId = 1

export function add(text: string) {
  todosSignal.value = [
    ...todosSignal.value,
    { id: nextId++, text, completed: false },
  ]
}

export function toggle(id: number) {
  todosSignal.value = todosSignal.value.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  )
}

export function remove(id: number) {
  todosSignal.value = todosSignal.value.filter((todo) => todo.id !== id)
}

export function update(id: number, text: string) {
  todosSignal.value = todosSignal.value.map((todo) => todo.id === id ? { ...todo, text } : todo)
}

// For compatibility with previous useTodos hook
export const todos = {
  list: todosSignal,
  add,
  toggle,
  remove,
  update,
}
