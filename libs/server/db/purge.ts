/// <reference lib="deno.ns" />
import { getEnvVar } from "@server/helpers/env.ts"
import { sql } from "./+index.ts"

/** Drops all tables from the database.
 *  if NODE_ENV!='prod' || 'production' and not --prod - then abort */
async function purge(): Promise<void> {
  if (getEnvVar("ENV") === "prod" && !Deno.args.includes("--prod")) {
    console.error("❌ Cannot purge database in production")
    Deno.exit(1)
  }
  let tables: string[] = []
  try {
    console.log("Fetching table names...")
    const result = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `
    tables = result.map((r) => r.tableName)
  } catch (err) {
    console.error("❌ Failed to fetch table names", err)
    Deno.exit(1)
  }

  if (!tables.length) {
    console.log("\n✅ No tables to purge.")
    Deno.exit(0)
  }

  try {
    console.log(`Purging ${tables.length} tables:`)
    for (const table of tables) {
      console.log("- " + table)
      await sql`DROP TABLE ${sql(table)} CASCADE`
    }
    console.log("\n✅ Database purged.")
    Deno.exit(0)
  } catch (err) {
    console.error("\n❌ Failed to purge database\n", err)
    Deno.exit(1)
  }
}

void purge()
