/// <reference lib="deno.ns" />
/**
 * Applies every pending migration under `libs/server/db/migrations` to Postgres.
 *
 * A thin entry point over `@spy4x/server/db`'s migration runner: connection settings
 * and the migrations folder are the only things this script decides, the mechanics
 * (locking, checksums, history table) live in the package.
 */
import { createSqlFromEnv, PostgresMigrationDriver, runMigrations } from "@spy4x/server/db"

const migrationsFolder = "./libs/server/db/migrations"

const sql = createSqlFromEnv(Deno.env.toObject())
if (!sql) {
  console.error("❌ Missing environment variable: DB_HOST")
  Deno.exit(1)
}

try {
  const driver = new PostgresMigrationDriver({ sql })
  const report = await runMigrations(driver, { folder: migrationsFolder })

  if (report.applied.length) {
    console.log(`Applied ${report.applied.length} migration(s):`)
    for (const name of report.applied) {
      console.log("- " + name)
    }
  } else {
    console.log("✅ No new migrations to apply.")
  }

  if (report.missing.length) {
    console.log(`⚠️  ${report.missing.length} recorded migration(s) have no file on disk:`)
    for (const name of report.missing) {
      console.log("- " + name)
    }
  }

  console.log("\n✅ Migrations successfully applied.")
} catch (err) {
  console.error("\n❌ Failed to apply migrations\n", err)
  Deno.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
