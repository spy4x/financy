import { Query, QueryConstructor, QueryHandler, QueryResult } from "./types.ts"

/**
 * QueryBus class for managing query handlers and executing queries.
 * It provides full type safety with automatic result type inference.
 *
 * @example
 * ```typescript
 * // Define payload and result types
 * interface UserListPayload {
 *   limit: number
 * }
 *
 * interface UserListResult {
 *   users: User[]
 *   total: number
 * }
 *
 * // Define query with payload and result types
 * class UserListQuery implements Query<UserListPayload, UserListResult> {
 *    __resultType?: UserListResult // Phantom type for result inference
 *   constructor(public data: UserListPayload) {}
 * }
 *
 * const queryBus = new QueryBus();
 *
 * // Register handler - return type is automatically inferred as UserListResult
 * queryBus.register(UserListQuery, async (query) => {
 *   console.log("Fetching users:", query.data);
 *   return { users: [], total: 0 }; // Must return UserListResult
 * });
 *
 * // Execute query - result is automatically typed as UserListResult
 * const result = await queryBus.execute(new UserListQuery({ limit: 10 }));
 * ```
 */
export class QueryBus {
  private handlers: Map<
    QueryConstructor<Query<unknown, unknown>>,
    QueryHandler<Query<unknown, unknown>>
  > = new Map()

  register<T extends Query<unknown, unknown>>(
    queryClass: QueryConstructor<T>,
    handler: QueryHandler<T>,
  ): void {
    this.handlers.set(queryClass, handler as QueryHandler<Query<unknown, unknown>>)
  }

  async execute<T extends Query<unknown, unknown>>(query: T): Promise<QueryResult<T>> {
    const QueryClass = query.constructor as QueryConstructor<T>
    const handler = this.handlers.get(QueryClass)

    if (!handler) {
      throw new Error(`No handler registered for query: ${QueryClass.name}`)
    }

    return await handler(query) as QueryResult<T>
  }

  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys()).map((query) => query.name)
  }
}
