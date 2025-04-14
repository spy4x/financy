import postgres from "postgres"
import { getEnvVar } from "$server/helpers"

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

// Uncomment for debugging queries
// sql.options.debug = (_, query, parameters) =>
// console.log(query, parameters.length ? parameters : "");
