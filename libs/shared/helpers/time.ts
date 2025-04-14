export function timeAgo(date: null | number | string | Date): string {
  let time = 0
  if (!date) {
    return "-"
  }
  if (typeof date === "string") {
    time = new Date(date).getTime()
  }
  if (typeof date === "number") {
    time = date
  }
  if (date instanceof Date) {
    time = date.getTime()
  }
  const now = Date.now()
  const secondsPast = Math.floor((now - time) / 1000)

  if (secondsPast < 10) {
    return `a moment ago`
  }
  if (secondsPast < 60) {
    return `${secondsPast} second${secondsPast === 1 ? "" : "s"} ago`
  }
  const minutesPast = Math.floor(secondsPast / 60)
  if (minutesPast < 60) {
    return `${minutesPast} minute${minutesPast === 1 ? "" : "s"} ago`
  }
  const hoursPast = Math.floor(minutesPast / 60)
  if (hoursPast < 24) {
    return `${hoursPast} hour${hoursPast === 1 ? "" : "s"} ago`
  }
  const daysPast = Math.floor(hoursPast / 24)
  if (daysPast < 30) {
    return `${daysPast} day${daysPast === 1 ? "" : "s"} ago`
  }
  const monthsPast = Math.floor(daysPast / 30)
  if (monthsPast < 12) {
    return `${monthsPast} month${monthsPast === 1 ? "" : "s"} ago`
  }
  const yearsPast = Math.floor(daysPast / 365)
  return `${yearsPast} year${yearsPast === 1 ? "" : "s"} ago`
}

export const days = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]

export function getDaysOfWeek(daysOfWeek: string): string[] {
  if (!daysOfWeek) return []
  return daysOfWeek.split("").reduce<string[]>((accum, day, i) => {
    if (day === "1") accum.push(days[i])
    return accum
  }, [])
}

export function isValidDate(input: unknown): boolean {
  return (input instanceof Date ||
    (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input))) &&
    !isNaN(new Date(input).getTime())
}
