/** Get a random string of the specified length.
 * Uses `crypto.getRandomValues` for secure randomness.
 * @param length The length of the string to generate. Default is 20.
 */
export function getRandomString(length = 20): string {
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  return Array.from(values)
    .map((x) => (x % 36).toString(36))
    .join("")
}
