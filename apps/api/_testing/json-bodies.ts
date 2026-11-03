import { MAX_JSON_BODY_BYTES } from "../services/json-body.ts"

/**
 * `body` as JSON followed by whitespace that takes it past the API's body cap. It is still valid
 * JSON the route would accept, so only the size can refuse it.
 */
export function oversizedJson(body: unknown): string {
  return JSON.stringify(body) + " ".repeat(MAX_JSON_BODY_BYTES)
}

/** A body that is cut off in the middle, so it is not JSON. */
export const MALFORMED_JSON = `{"username":`
