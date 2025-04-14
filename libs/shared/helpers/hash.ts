const iterations: number = 100_000
const keyLength: number = 32
/** Hash a password using PBKDF2 with a random salt and a pepper.
 * @param password The password to hash.
 * @param pepper A secret string to add to the password before hash.
 * @returns A string in the format "salt:derivedKey" where both salt and derivedKey are hex-encoded.
 * @example
 * const hashed = await hash("password", "pepper")
 * // hashed = "f3a2c4b1:3f2a1b4c"
 * @see checkHash
 */
export async function hash(
  password: string,
  pepper: string,
): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // Derive key using PBKDF2
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + pepper),
    "PBKDF2",
    false,
    ["deriveBits"],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    keyLength * 8,
  )

  const derivedKey = new Uint8Array(derivedBits)

  // Encode salt and key into hex
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  const derivedKeyHex = Array.from(derivedKey).map((b) => b.toString(16).padStart(2, "0")).join("")

  return `${saltHex}:${derivedKeyHex}`
}

export async function checkHash(
  originalString: string,
  hashedString: string,
  pepper: string,
): Promise<boolean> {
  const [saltHex, storedHashHex] = hashedString.split(":")
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  )

  // Concatenate original string with pepper
  const pepperedPassword = originalString + pepper

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepperedPassword),
    "PBKDF2",
    false,
    ["deriveBits"],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    32 * 8,
  )

  const derivedKey = new Uint8Array(derivedBits)
  const derivedKeyHex = Array.from(derivedKey).map((b) => b.toString(16).padStart(2, "0")).join("")

  return derivedKeyHex === storedHashHex
}
