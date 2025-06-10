export type BadgeColor = "red" | "orange" | "green" | "gray" | "blue" | "purple" | "purpleNav"

interface Props {
  text: string
  color?: BadgeColor
  type?: "outline"
  class?: string
}
const outlineClasses = {
  red: "border-red-600 text-red-600",
  orange: "border-orange-400 text-orange-400",
  green: "border-green-600 text-green-600",
  gray: "border-gray-300 text-gray-600",
  blue: "border-blue-600 text-blue-600",
  purple: "border-purple-600 text-purple-600",
  purpleNav: "border-purple-700 bg-primary text-purple-100",
}

const filledClasses = {
  red: "border-red-600 bg-red-600 text-red-50",
  orange: "border-orange-400 bg-orange-400 text-orange-50",
  green: "border-green-600 bg-green-600 text-green-50",
  gray: "border-gray-200 bg-gray-200 text-gray-600",
  blue: "border-blue-600 bg-blue-600 text-blue-50",
  purple: "border-purple-900 bg-purple-900 text-purple-50",
  purpleNav: "border-purple-700 bg-primary text-purple-100",
}

const colorClasses = (color: BadgeColor = "purple", type?: "outline"): string => {
  return type === "outline"
    ? outlineClasses[color] ?? outlineClasses.purple
    : filledClasses[color] ?? filledClasses.purple
}

export function Badge({ text, color, type, class: classes }: Props) {
  const badgeClasses =
    `inline-flex items-center border rounded-md px-2.5 py-1 text-xs whitespace-nowrap font-medium capitalize ${
      colorClasses(color, type)
    } ${classes || ""}`

  return <span class={badgeClasses}>{text}</span>
}
