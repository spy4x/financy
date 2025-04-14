import { type } from "arktype"

export const UserSchema = type({
  id: "number",
  name: "string",
})

// extract the type if needed
export type User = typeof UserSchema.infer
