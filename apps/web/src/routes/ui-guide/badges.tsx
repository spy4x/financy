import { Badge } from "@web/components/ui/Badge.tsx"

export function UIGuideBadges() {
  return (
    <div class="space-y-2">
      <h2 class="border-b-1 pb-1 mb-4">Badges</h2>
      <div class="flex flex-wrap items-center gap-2">
        <Badge text="Badge red" color="red" />

        <Badge text="Badge orange" color="orange" />

        <Badge text="Badge green" color="green" />

        <Badge text="Badge gray" color="gray" />

        <Badge text="Badge blue" color="blue" />

        <Badge text="Badge purple" />

        <Badge text="purpleNav" color="purpleNav" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Badge type="outline" text="Outline red" color="red" />
        <Badge type="outline" text="Outline orange" color="orange" />
        <Badge type="outline" text="Outline green" color="green" />
        <Badge type="outline" text="Outline gray" color="gray" />
        <Badge type="outline" text="Outline blue" color="blue" />
        <Badge type="outline" text="Outline purple" />
        <Badge type="outline" text="purpleNav" color="purpleNav" />
      </div>
    </div>
  )
}
