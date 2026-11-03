/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { validate } from "@spy4x/validation"
import { authOTPSchema } from "@domain/identity"

Deno.test("authOTPSchema: accepts a code with a leading zero", () => {
  const result = validate(authOTPSchema, { otp: "012345" })
  expect(result.error).toBeNull()
  expect(result.data?.otp).toBe("012345")
})

Deno.test("authOTPSchema: accepts an all-zero code", () => {
  const result = validate(authOTPSchema, { otp: "000000" })
  expect(result.error).toBeNull()
  expect(result.data?.otp).toBe("000000")
})

Deno.test("authOTPSchema: accepts a code without a leading zero", () => {
  const result = validate(authOTPSchema, { otp: "123456" })
  expect(result.error).toBeNull()
  expect(result.data?.otp).toBe("123456")
})

Deno.test("authOTPSchema: rejects a code with too few digits", () => {
  const result = validate(authOTPSchema, { otp: "12345" })
  expect(result.error).not.toBeNull()
})

Deno.test("authOTPSchema: rejects a code with too many digits", () => {
  const result = validate(authOTPSchema, { otp: "1234567" })
  expect(result.error).not.toBeNull()
})

Deno.test("authOTPSchema: rejects a code with a non-digit character", () => {
  const result = validate(authOTPSchema, { otp: "12a456" })
  expect(result.error).not.toBeNull()
})

Deno.test("authOTPSchema: rejects a code with leading whitespace", () => {
  const result = validate(authOTPSchema, { otp: " 123456" })
  expect(result.error).not.toBeNull()
})

Deno.test("authOTPSchema: rejects Arabic-Indic digits", () => {
  const result = validate(authOTPSchema, { otp: "١٢٣٤٥٦" })
  expect(result.error).not.toBeNull()
})

Deno.test("authOTPSchema: rejects a number, not a string", () => {
  const result = validate(authOTPSchema, { otp: 123456 })
  expect(result.error).not.toBeNull()
})
