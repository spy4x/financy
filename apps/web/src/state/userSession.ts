import { computed, effect, signal } from "@preact/signals"
import { OperationState, UserRole, UserSession } from "@shared/types"
import { set } from "@client/helpers"
import { auth } from "./auth.ts"

interface State {
  list: UserSession[]
  listOp: OperationState<UserSession[]>
}

const initialState: State = {
  list: [],
  listOp: { inProgress: false, error: null, result: null },
}

const store = signal<State>(initialState)

async function load(): Promise<void> {
  set(store, { listOp: { inProgress: true, error: null, result: null } })

  try {
    const response = await fetch("/api/sessions")
    if (!response.ok) {
      throw new Error("Failed to load session")
    }
    const { data } = await response.json()
    set(store, {
      list: data,
      listOp: { inProgress: false, error: null, result: data },
    })
  } catch (error) {
    set(store, {
      listOp: { inProgress: false, error: error.message, result: null },
    })
  }
}

export const userSession = {
  list: computed(() => store.value.list),
  listOp: computed(() => store.value.listOp),
  init: () => {
    let isUser = false
    effect(() => {
      if (!isUser && auth.user.value && auth.user.value.role === UserRole.ADMIN) {
        isUser = true
        load()
      } else if (isUser && !auth.user.value) {
        isUser = false
        set(store, initialState)
      }
    })
  },
}
