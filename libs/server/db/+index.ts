import postgres from "postgres"
import { getEnvVar } from "@server/helpers/env.ts"
import { PublicAPICacheModel } from "@shared/cache"

export const sql = postgres({
  host: getEnvVar("DB_HOST"),
  user: getEnvVar("DB_USER"),
  pass: getEnvVar("DB_PASS"),
  db: getEnvVar("DB_NAME"),
  transform: postgres.camel,
  connection: {
    application_name: "dashboard-backend",
  },
})

export type Transaction = postgres.TransactionSql
export { postgres }

// Uncomment for debugging queries
// sql.options.debug = (_, query, parameters) =>
// console.log(query, parameters.length ? parameters : "");

export class DbServiceBase {
  protected sql = sql

  protected setSql(_sql: typeof sql | Transaction): void {
    this.sql = _sql
  }

  async isConnected(): Promise<boolean> {
    try {
      await sql`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  begin<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return this.sql.begin((transaction) => {
      const service = Object.create(this) as this
      service.setSql(transaction)
      return fn(service)
    }) as Promise<T>
  }

  async connect(): Promise<void> {
    await this.sql`SELECT 1`
  }

  async shutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 })
  }

  /** Sanitizes object by removing inappropriate fields */
  sanitize<T>(obj: Partial<T>): Partial<T> {
    return Object.keys(obj).reduce<Partial<T>>((acc, key) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (obj[key as keyof Partial<T>] !== undefined) {
        acc[key as keyof Partial<T>] = obj[key as keyof Partial<T>]
      }
      // remove "updatedAt" field if it exists
      if (key === "updatedAt") {
        delete acc[key as keyof Partial<T>]
      }
      return acc
    }, {})
  }

  async findOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    id: number,
    command: postgres.PendingQuery<T[]>,
  ): Promise<null | T> {
    return cache.wrap(id, async () => (await command)[0])
  }

  async createOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const created = (await command)[0]
    if (created) {
      await cache.set(created.id, created)
    }
    return created
  }

  async updateOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const updated = (await command)[0]
    if (updated) {
      await cache.set(updated.id, updated)
    }
    return updated
  }

  async deleteOne<T extends postgres.Row>(
    cache: PublicAPICacheModel<T>,
    command: postgres.PendingQuery<T[]>,
  ): Promise<T> {
    const deleted = (await command)[0]
    if (deleted) {
      await cache.delete(deleted.id)
    }
    return deleted
  }

  buildMethods<M extends postgres.Row, C extends Partial<unknown>, U extends Partial<unknown>>(
    table: string,
    cache: PublicAPICacheModel<M>,
  ) {
    return {
      findOne: async ({ id }: { id: number }) =>
        this.findOne<M>(
          cache,
          id,
          sql`SELECT * FROM ${sql(table)} WHERE id = ${id}`,
        ),
      findChanged: async (updatedAtGt: Date): Promise<M[]> => {
        return await sql<
          M[]
        >`SELECT * FROM ${sql(table)} WHERE updated_at > ${updatedAtGt} ORDER BY updated_at DESC`
      },
      createOne: async ({ data }: { data: C }) =>
        this.createOne<M>(
          cache,
          sql<M[]>`
              INSERT INTO ${sql(table)}
              ${sql(this.sanitize(data))}
              RETURNING *`,
        ),
      updateOne: async (params: {
        id: number
        data: U
      }) =>
        this.updateOne<M>(
          cache,
          sql<M[]>`
              UPDATE ${sql(table)}
              SET updated_at = NOW(), ${sql(this.sanitize(params.data))}
              WHERE id = ${params.id}
              RETURNING *`,
        ),
      deleteOne: async ({ id }: { id: number }) =>
        this.deleteOne<M>(
          cache,
          sql<M[]>`
              UPDATE ${sql(table)}
              SET updated_at = NOW(), deleted_at = NOW()
              WHERE id = ${id}
              RETURNING *`,
        ),
    }
  }
}
