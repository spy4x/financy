/** Formats a decimal number like 13.50354562 to a number with two decimal points, like 13.50 */
export function formatDecimal(value: number): string {
  return value.toFixed(2)
}

/** Formats a date-like string/number/Date to a human-readable format. Example: "12/03/2023 14:30" */
export function formatTime(
  date: undefined | null | number | string | Date,
  options?: { full?: boolean; timeOnly?: boolean; timeZone?: string },
): string {
  if (!date) {
    return "-"
  }
  const targetDate = new Date(date)
  const isToday = new Date().toDateString() === targetDate.toDateString()
  const hoursAndMinutes = targetDate.toLocaleTimeString("en-GB", { // en-GB is used to display time in the format "HH:MM"
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options?.timeZone,
  })
  if (options?.timeOnly) {
    return hoursAndMinutes
  }
  if (isToday && !options?.full) {
    return `Today ${hoursAndMinutes}`
  }
  return targetDate.toLocaleString("en-GB", { // en-GB is used to display dates in the format "DD/MM/YYYY"
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: options?.timeZone,
  }) + ` ${hoursAndMinutes}`
}

/** Formats a string to kebab-case. Example: "Hello World" -> "hello-world" */
export function formatToKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase()
}

/** Formats a word to plural. Example: "cat" -> "cats", "baby" -> "babies" */
export function pluralize(word: string): string {
  if (word.endsWith("y") && !/[aeiou]y$/.test(word)) {
    return word.slice(0, -1) + "ies"
  } else if (/(s|sh|ch|x|z)$/.test(word)) {
    return word + "es"
  } else if (word.endsWith("o")) {
    return word + "es"
  } else {
    return word + "s"
  }
}

/** Converts a base64 URL string to a Uint8Array. */
export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/")

  const rawData = globalThis.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}
