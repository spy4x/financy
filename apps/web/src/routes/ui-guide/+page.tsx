import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { UIGuideTable } from "./table.tsx"
import { UIGuideIcons } from "./icons.tsx"
import { UIGuideButtons } from "./buttons.tsx"
import { UIGuideInputs } from "./inputs.tsx"
import { UIGuideOtherComponents } from "./other.tsx"
import { UIGuideBadges } from "./badges.tsx"
import { UIGuideEditor } from "./form.tsx"
import { UIGuideInstructions } from "./instructions.tsx"
import { UIGuideCurrency } from "./currency.tsx"

export function UIGuide() {
  return (
    <section class="page-layout">
      <PageTitle>UI Guide</PageTitle>

      <UIGuideInstructions />

      <UIGuideButtons />

      <UIGuideInputs />

      <UIGuideCurrency />

      <UIGuideOtherComponents />

      <UIGuideBadges />

      <UIGuideTable />

      <UIGuideEditor />

      <UIGuideIcons />
    </section>
  )
}
