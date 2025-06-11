import { PageTitle } from "@web/components/ui/PageTitle.tsx"
import { UIGuideTable } from "./table.tsx"
import { UIGuideIcons } from "./icons.tsx"
import { UIGuideButtons } from "./buttons.tsx"
import { UIGuideInputs } from "./inputs.tsx"
import { UIGuideOtherComponents } from "./other.tsx"
import { UIGuideBadges } from "./badges.tsx"
import { UIGuideEditor } from "./form.tsx"
import { UIGuideInstructions } from "./instructions.tsx"

export function UIGuide() {
  return (
    <div class="page-layout">
      <PageTitle>UI Guide</PageTitle>

      <UIGuideInstructions />

      <UIGuideButtons />

      <UIGuideInputs />

      <UIGuideOtherComponents />

      <UIGuideBadges />

      <UIGuideTable />

      <UIGuideEditor />

      <UIGuideIcons />
    </div>
  )
}
