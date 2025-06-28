import { Hono } from "hono"
import { db } from "@api/services/db.ts"
import type { APIContext } from "../_types.ts"

export const currenciesRoute = new Hono<APIContext>()
  .get("/", async (c) => {
    try {
      const currencies = await db.currency.findMany()
      return c.json({ data: currencies })
    } catch (error) {
      console.error("Error fetching currencies:", error)
      return c.json({ error: "Failed to fetch currencies" }, 500)
    }
  })
  .get("/search", async (c) => {
    try {
      const currencies = await db.currency.findMany()
      return c.json({ data: currencies })
    } catch (error) {
      console.error("Error searching currencies:", error)
      return c.json({ error: "Failed to search currencies" }, 500)
    }
  })
  .get("/:code", async (c) => {
    try {
      const code = c.req.param("code")
      const currencies = await db.currency.findMany()
      const currency = currencies.find((curr) => curr.code === code.toUpperCase())

      if (!currency) {
        return c.json({ error: "Currency not found" }, 404)
      }

      return c.json({ data: currency })
    } catch (error) {
      console.error("Error fetching currency:", error)
      return c.json({ error: "Failed to fetch currency" }, 500)
    }
  })
