import { expect } from "@std/expect"
import { PAYEE_KEY_MAX_LENGTH } from "@domain/transactions"
import { memoryKey } from "./payee-memory.ts"

Deno.test("memoryKey gives one key for one payee across card and reference numbers", () => {
  expect(memoryKey(`CARD 4111********1111 COFFEE BAR REF 99812345`)).toBe(`coffee bar`)
  expect(memoryKey(`card 4111********2222 Coffee Bar ref 11223344`)).toBe(`coffee bar`)
})

Deno.test("memoryKey is empty for a payee that is only a number, or none", () => {
  expect(memoryKey(`99812345`)).toBe(``)
  expect(memoryKey(``)).toBe(``)
})

Deno.test("memoryKey cuts a long payee to the column's length without splitting a character", () => {
  expect(memoryKey(`a`.repeat(900))).toBe(`a`.repeat(PAYEE_KEY_MAX_LENGTH))
  const key = memoryKey(`a${`😀`.repeat(150)}`)
  expect(key.length).toBe(PAYEE_KEY_MAX_LENGTH - 1)
  expect(key.endsWith(`😀`)).toBe(true)
})
