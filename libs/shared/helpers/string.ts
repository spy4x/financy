/** Returns true if finds a word in a string or number. Example: search("hello", "lo") */
export function search(
  value: string | number | null | undefined,
  word: string,
  condition = true,
): boolean {
  return condition && value
    ? typeof value === "string"
      ? value.toLowerCase().includes(word.toLowerCase())
      : value === Number(word)
    : false
}
