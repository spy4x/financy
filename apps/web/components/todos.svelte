<svelte:options runes={true} />

<script lang="ts">
    // --- State Management ---
    interface Todo {
        id: number;
        text: string;
        description?: string;
        completed: boolean;
        assignedTo?: string;
    }

    class TodoStore {
        todos = $state<Todo[]>([]);
        filter = $state<"all" | "active" | "completed">("all");

        constructor() {
            // Load from localStorage on mount
            const saved = localStorage.getItem("todos");
            if (saved) {
                try {
                    this.todos = JSON.parse(saved);
                } catch (e) {
                    console.error("Failed to parse saved todos", e);
                    this.todos = [];
                }
            }

            // Save to localStorage whenever todos change
            $effect(() => {
                if (typeof window !== "undefined") {
                    localStorage.setItem("todos", JSON.stringify(this.todos));
                }
            });
        }

        addTodo(text: string, description?: string, assignedTo?: string) {
            if (text.trim()) {
                this.todos.push({
                    text,
                    description,
                    assignedTo,
                    completed: false,
                    id: Date.now(),
                });
            }
        }

        toggleTodo(id: number) {
            const index = this.todos.findIndex((t) => t.id === id);
            if (index !== -1) {
                this.todos[index].completed = !this.todos[index].completed;
            }
        }

        deleteTodo(id: number) {
            const index = this.todos.findIndex((t) => t.id === id);
            if (index !== -1) {
                this.todos.splice(index, 1);
            }
        }

        get filteredTodos(): Todo[] {
            switch (this.filter) {
                case "active":
                    return this.todos.filter((t) => !t.completed);
                case "completed":
                    return this.todos.filter((t) => t.completed);
                default:
                    return this.todos;
            }
        }

        itemsLeft = $derived(this.todos.filter((t) => !t.completed).length);

        clearCompleted() {
            this.todos = this.todos.filter((t) => !t.completed);
        }

        setFilter(filter: "all" | "active" | "completed") {
            this.filter = filter;
        }

        allCompleted = $derived(this.todos.every((t) => t.completed));

        toggleAll(checked: boolean) {
            this.todos.forEach((todo) => {
                todo.completed = checked;
            });
        }
    }

    const todoStore = new TodoStore();

    // --- Component ---
    let newTodoText = $state("");
    let newTodoDescription = $state("");
    let newTodoAssignedTo = $state("");
    function onSubmit(e: KeyboardEvent) {
        if (e.key === "Enter" && newTodoText.trim()) {
            todoStore.addTodo(
                newTodoText,
                newTodoDescription,
                newTodoAssignedTo,
            );
            newTodoText = "";
            newTodoDescription = "";
            newTodoAssignedTo = "";
        }
    }
</script>

<div class="bg-white shadow-lg relative m-0 mt-32">
    <header class="header mb-8">
        <input
            type="text"
            class="new-todo w-full p-4 pl-14 text-2xl bg-gray-50 placeholder:text-gray-400 border-none shadow-inner"
            placeholder="What needs to be done?"
            onkeydown={onSubmit}
            bind:value={newTodoText}
        />
        <textarea
            class="new-todo w-full p-4 pl-14 text-2xl bg-gray-50 placeholder:text-gray-400 border-none shadow-inner"
            placeholder="Description"
            onkeydown={onSubmit}
            rows="5"
            bind:value={newTodoDescription}
        ></textarea>
        <input
            type="text"
            class="new-todo w-full p-4 pl-14 text-2xl bg-gray-50 placeholder:text-gray-400 border-none shadow-inner"
            placeholder="Assigned to"
            onkeydown={onSubmit}
            bind:value={newTodoAssignedTo}
        />
    </header>
    <h1 class="">Todo List:</h1>
    <main class="main relative z-20 border-t border-gray-200">
        <input
            type="checkbox"
            class="toggle-all absolute top-[-55px] left-[-12px] w-14 h-9 text-center opacity-0 appearance-none"
            id="toggle-all"
            checked={todoStore.allCompleted}
            onchange={(e) => todoStore.toggleAll(e.target.checked)}
        />
        <label
            for="toggle-all"
            class="absolute top-[-55px] left-[-27px] block w-14 h-9 text-sm cursor-pointer rotate-90 before:content-['❯'] before:text-gray-400 before:text-2xl before:p-2.5 before:h-9"
            >Mark all as complete</label
        >
        <ul class="todo-list m-0 p-0 list-none">
            {#each todoStore.filteredTodos as todo}
                <li
                    class:completed={todo.completed}
                    class="relative text-2xl border-b border-gray-200 last:border-none"
                >
                    <div class="view flex items-center p-3">
                        <div class="relative mr-3 flex items-center">
                            <input
                                id="toggle-{todo.id}"
                                type="checkbox"
                                class="peer sr-only"
                                checked={todo.completed}
                                onchange={() => todoStore.toggleTodo(todo.id)}
                            />
                            <div
                                class="h-6 w-6 rounded-full border-2 border-gray-300 bg-white peer-checked:border-indigo-600 peer-checked:bg-indigo-600 absolute"
                            ></div>
                            <svg
                                class="absolute h-6 w-6 text-white opacity-0 peer-checked:opacity-100"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="3"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <div class="flex-grow">
                            <label
                                for="toggle-{todo.id}"
                                class="pl-11 block cursor-pointer break-words transition-colors {todo.completed
                                    ? 'text-gray-400 line-through'
                                    : 'text-gray-800'}">{todo.text}</label
                            >
                            {#if todo.description}
                                <p
                                    class="pl-11 text-base text-gray-500 mt-1 {todo.completed
                                        ? 'line-through'
                                        : ''}"
                                >
                                    {todo.description}
                                </p>
                            {/if}
                            {#if todo.assignedTo}
                                <p
                                    class="pl-11 text-sm text-indigo-500 mt-1 {todo.completed
                                        ? 'line-through'
                                        : ''}"
                                >
                                    Assigned to: {todo.assignedTo}
                                </p>
                            {/if}
                        </div>
                        <button
                            aria-label="Delete todo"
                            type="button"
                            class="text-2xl text-gray-500 transition-colors hover:text-red-500"
                            onclick={() => todoStore.deleteTodo(todo.id)}
                        >
                            <!-- add trashbin icon -->
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="h-6 w-6"
                            >
                                <path
                                    d="M3 6h18M4 6l1 16h14l1-16H4zm2 0h12m-6 0v12m0-12h6m-6 0H4"
                                ></path>
                            </svg>
                        </button>
                    </div>
                </li>
            {/each}
        </ul>
    </main>
    {#if todoStore.todos.length}
        <footer
            class="footer text-gray-700 p-3 flex items-center justify-between border-t border-gray-200 flex-wrap gap-2"
        >
            <span class="todo-count mr-2">
                <strong class="font-semibold">{todoStore.itemsLeft}</strong>
                {todoStore.itemsLeft === 1 ? " item" : " items"} left
            </span>
            <ul class="filters flex list-none m-0 p-0">
                <li class="mr-1.5">
                    <button
                        type="button"
                        class:selected={todoStore.filter === "all"}
                        onclick={() => todoStore.setFilter("all")}
                        class="text-inherit no-underline p-1.5 border border-transparent rounded-md hover:border-gray-300 {todoStore.filter ===
                        'all'
                            ? 'border-gray-300'
                            : ''}"
                    >
                        All
                    </button>
                </li>
                <li class="mr-1.5">
                    <button
                        type="button"
                        class:selected={todoStore.filter === "active"}
                        onclick={() => todoStore.setFilter("active")}
                        class="text-inherit no-underline p-1.5 border border-transparent rounded-md hover:border-gray-300 {todoStore.filter ===
                        'active'
                            ? 'border-gray-300'
                            : ''}"
                    >
                        Active
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        class:selected={todoStore.filter === "completed"}
                        onclick={() => todoStore.setFilter("completed")}
                        class="text-inherit no-underline p-1.5 border border-transparent rounded-md hover:border-gray-300 {todoStore.filter ===
                        'completed'
                            ? 'border-gray-300'
                            : ''}"
                    >
                        Completed
                    </button>
                </li>
            </ul>
            {#if todoStore.todos.filter((t) => t.completed).length > 0}
                <button
                    class="clear-completed m-0 cursor-pointer relative bg-none border-none text-inherit p-0 hover:underline"
                    onclick={() => todoStore.clearCompleted()}
                >
                    Clear completed
                </button>
            {/if}
        </footer>
    {/if}
</div>
