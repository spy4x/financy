import { computed, effect, ReadonlySignal, signal } from "@preact/signals"
import {
  OperationResult,
  OperationState,
  User,
  userAdminUpdateSchema,
  UserBase,
  userBaseSchema,
  userSchema,
} from "@shared/types"
import { type BaseModelStore, buildModelStore } from "@shared/helpers"
import { toast } from "./toast.ts"
import { runtimeEnvVars } from "./+helpers.ts"
import { set } from "@client/helpers"
import { auth } from "./auth.ts"

interface State {
  list: User[]
  listOp: OperationState<User[]>
  createOp: OperationState<User>
  updateOps: Map<number, OperationState<User>>
  deleteOps: Map<number, OperationState<User>>
  setPasswordOps: Map<number, OperationState<boolean>>
}

const initialState: State = {
  list: [],
  listOp: { inProgress: false, error: null, result: null },
  createOp: { inProgress: false, error: null, result: null },
  updateOps: new Map(),
  deleteOps: new Map(),
  setPasswordOps: new Map(),
}

const store = signal<State>(initialState)

type UserStoreTyped = BaseModelStore<
  (User),
  typeof userSchema,
  typeof userBaseSchema,
  typeof userAdminUpdateSchema
>
export type UserStore =
  & UserStoreTyped
  & {
    create: (data: UserBase) => Promise<OperationResult<User>>
    setPassword: (
      id: number,
      password: string,
      username: string,
    ) => Promise<OperationResult<boolean>>
  }

export const baseUser: UserStore = {
  ...buildModelStore(
    "user",
    `${runtimeEnvVars.API_PREFIX}/users`,
    store,
    toast,
    userSchema,
    userBaseSchema,
    userAdminUpdateSchema,
    (a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName),
  ),
  init: () => {
    let isUser = false
    effect(() => {
      if (!isUser && auth.user.value) {
        isUser = true
      } else if (isUser && !auth.user.value) {
        isUser = false
        set(store, initialState)
      }
    })
  },
  create: async (data: UserBase) => {
    set(store, { createOp: { inProgress: true, error: null, result: null } })
    try {
      const response = await fetch(`${runtimeEnvVars.API_PREFIX}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        set(store, {
          createOp: {
            inProgress: false,
            error: "Failed to create user",
            result: null,
          },
        })
        toast.error({ body: "Failed to create user" })
        return { error: "Failed to create user", result: null }
      }
      const result = userSchema.parse(await response.json())
      set(store, {
        createOp: { inProgress: false, error: null, result },
        list: [...store.value.list, result],
      })
      toast.success({ body: "User was created" })
      return { error: null, result }
    } catch (error) {
      set(store, {
        createOp: {
          inProgress: false,
          error: error.message,
          result: null,
        },
      })
      toast.error({ body: "Failed to create user" })
      return { error: error.message, result: null }
    }
  },
  setPassword: async (
    id: number,
    password: string,
    username: string,
  ) => {
    set(store, {
      setPasswordOps: store.value.setPasswordOps.set(id, {
        inProgress: true,
        error: null,
        result: null,
      }),
    })
    try {
      const response = await fetch(`/api/users/${id}/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, username }),
      })
      if (!response.ok) {
        set(store, {
          setPasswordOps: store.value.setPasswordOps.set(id, {
            inProgress: false,
            error: "Failed to set password",
            result: null,
          }),
        })
        toast.error({ body: "Failed to set password" })
        return { error: "Failed to set password", result: null }
      }
      const result = await response.json()
      const updatedUser = store.value.list.find((user) => user.id === id)
      let updatedList = []
      if (updatedUser) {
        updatedList = store.value.list.filter((user) => user.id !== updatedUser.id)
        updatedUser.username = username
        updatedList.push(updatedUser)
      } else {
        updatedList = store.value.list
      }

      set(store, {
        setPasswordOps: store.value.setPasswordOps.set(id, {
          inProgress: false,
          error: null,
          result: result,
        }),
        list: updatedList,
      })
      toast.success({ body: "Password was set" })
      return { error: null, result }
    } catch (error) {
      set(store, {
        setPasswordOps: store.value.setPasswordOps.set(id, {
          inProgress: false,
          error: error.message,
          result: null,
        }),
      })
      toast.error({ body: "Failed to set password" })
      return { error: error.message, result: null }
    }
  },
}
baseUser.op.setPassword = (id: number) => computed(() => store.value.setPasswordOps.get(id))

export const user = baseUser as UserStore & {
  op: UserStoreTyped["op"] & {
    setPassword: (id: number) => ReadonlySignal<OperationState<boolean>>
  }
}
