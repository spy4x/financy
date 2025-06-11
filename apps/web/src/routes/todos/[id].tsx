import { useEffect, useState } from "preact/hooks"
import { todos } from "../../services/todos.ts"
import { useRoute } from "wouter-preact"

export function TodoEditor() {
  const { update } = todos
  const [_match, params] = useRoute("/todos/:id")
  const id = Number(params?.id)
  const todo = todos.list.value.find((t) => t.id === id)
  const [text, setText] = useState(todo?.text || "")

  useEffect(() => {
    setText(todo?.text || "")
  }, [todo])

  if (!todo) return <div>Todo not found</div>

  function handleSave(e: Event) {
    e.preventDefault()
    update(id, text)
    // Optionally, redirect back to list
    history.back()
  }

  return (
    <form onSubmit={handleSave}>
      <h2>Edit Todo</h2>
      <input
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />
      <button type="submit">Save</button>
    </form>
  )
}
