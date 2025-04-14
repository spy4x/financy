/** Waits for a specified amount of time in milliseconds. */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const DEFAULT_DEBOUNCE_DELAY = 300
/** Debounce function to limit the rate at which a function can fire. */
export function debounce<Params extends unknown[]>(
  func: (...args: Params) => unknown,
  delay = DEFAULT_DEBOUNCE_DELAY,
): (...args: Params) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Params) => {
    timer && clearTimeout(timer)
    timer = setTimeout(() => func(...args), delay)
  }
}
