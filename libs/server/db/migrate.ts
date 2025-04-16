import { extname, join } from "@std/path"
import { sql } from "./+index.ts"
import type postgres from "postgres"

const migrationsFolder = "./libs/server/db/migrations"
const fileExtension = ".sql"

interface Migration {
  id: number
  name: string
  createdAt: Date
}

async function applyMigrations() {
  try {
    // check if migrations table exists
    const tableExists =
      await sql`SELECT exists (SELECT FROM information_schema.tables WHERE table_name = 'migrations')`

    // create migrations table if it does not exist
    if (!tableExists[0].exists) {
      await sql`
        CREATE TABLE migrations
        (
          id         SERIAL PRIMARY KEY,
          name       VARCHAR(100) NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `
      console.log("Migrations table was created.\n")
    }
  } catch (err) {
    console.error("❌ Failed to create migrations table", err)
    Deno.exit(1)
  }

  let migrations: string[] = []

  try {
    // get list of migrations from database
    const migrationsResult = await sql<Migration[]>`SELECT name
                                       FROM migrations`
    migrations = migrationsResult.map((m) => m.name)
  } catch (err) {
    console.error("❌ Failed to get migrations from database", err)
    Deno.exit(1)
  }

  try {
    // read directory and get .sql files
    const files = Deno.readDirSync(migrationsFolder)
    const migrationsToApply = Array.from(files)
      .filter((file) => extname(file.name) === fileExtension)
      .map((file) => file.name.replace(fileExtension, ""))
      .filter((file) => !migrations.includes(file))
      .sort()

    if (!migrationsToApply.length) {
      console.log("✅ No new migrations to apply.")
      Deno.exit(0)
    }
    console.log(`Applying ${migrationsToApply.length} migration(s):`)

    for (const migration of migrationsToApply) {
      console.log("- " + migration)
      // read SQL file
      const sqlScript = Deno.readTextFileSync(
        join(migrationsFolder, migration + fileExtension),
      )
      // execute the SQL script
      await sql.begin(async (tx: postgres.TransactionSql) => {
        await tx.unsafe(sqlScript)
        // record that this migration has been run
        await tx`INSERT INTO migrations (name)
                 VALUES (${migration})`
      })
    }

    console.log("\n✅ Migrations successfully applied.")
    Deno.exit(0)
  } catch (err) {
    console.error("\n❌ Failed to apply migrations\n", err)
    Deno.exit(1)
  }
}

void applyMigrations()
