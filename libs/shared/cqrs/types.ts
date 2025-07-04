export interface Command<TPayload, TResult> {
  data: TPayload
  // Phantom type to help with inference
  readonly __resultType?: TResult
}

export interface Query<TPayload, TResult> {
  data: TPayload
  // Phantom type to help with inference
  readonly __resultType?: TResult
}

// deno-lint-ignore no-explicit-any
export type CommandConstructor<T extends Command<unknown, unknown>> = new (...args: any[]) => T

// deno-lint-ignore no-explicit-any
export type QueryConstructor<T extends Query<unknown, unknown>> = new (...args: any[]) => T

// Extract result type from command
export type CommandResult<T extends Command<unknown, unknown>> = T extends Command<unknown, infer R>
  ? R
  : never

// Extract result type from query
export type QueryResult<T extends Query<unknown, unknown>> = T extends Query<unknown, infer R> ? R
  : never

// Command handler type
export type CommandHandler<T extends Command<unknown, unknown>> = (
  command: T,
) => Promise<CommandResult<T>>

// Query handler type
export type QueryHandler<T extends Query<unknown, unknown>> = (
  query: T,
) => Promise<QueryResult<T>>

export interface Event<TPayload> {
  data?: TPayload
}

// deno-lint-ignore no-explicit-any
export type EventConstructor<T extends Event<unknown>> = new (...args: any[]) => T
