import { useState } from "preact/hooks"
import { todos } from "../../services/todos.ts"
import { useLocation } from "wouter-preact"

export function TodoList() {
  const { list, add, toggle, remove } = todos
  const [input, setInput] = useState("")
  const [, setLocation] = useLocation()

  function handleAdd(e: Event) {
    e.preventDefault()
    if (input.trim()) {
      add(input.trim())
      setInput("")
    }
  }

  return (
    <div>
      <h2>Todos</h2>
      <form onSubmit={handleAdd}>
        <input
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          placeholder="Add a todo"
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        {list.value.map((todo: any) => (
          <li key={todo.id}>
            <label style={{ textDecoration: todo.completed ? "line-through" : undefined }}>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggle(todo.id)}
              />
              {todo.text}
            </label>
            <button type="button" onClick={() => setLocation(`/todos/${todo.id}`)}>Edit</button>
            <button type="button" onClick={() => remove(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
