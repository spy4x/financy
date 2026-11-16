import type { ComponentChildren, JSX } from "preact"
import { useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { useFormat } from "@spy4x/preact-ui/format"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { PageAction, PageHeader, TOUCH_TARGET } from "@spy4x/preact-ui/page-header"
import { IconPlus } from "@spy4x/preact-icons"
import { dayLabel, relativeDayLabel } from "@spy4x/time/locale"
import type { PlanRefusal } from "@domain/billing"
import { ListCard, ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { PausedBadge, type RecurringRuleRow, type UpcomingRow } from "./recurring-parts.tsx"
import { EntryAmount } from "./transaction-parts.tsx"
import { type Navigate, RECURRING_PATHS } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

export interface RecurringScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  rules: readonly RecurringRuleRow[]
  upcoming: readonly UpcomingRow[]
  /** Today in the household's time zone: "Today" and "Tomorrow" are said as words. */
  today: string
  loading: boolean
  /** A failed read, or a refused skip or restore. */
  listError: Message | null
  /** The plan refused a restore. */
  listPlan?: PlanRefusal | null
  /** Skips one upcoming date, after the person confirms. Left out, nothing offers a skip. */
  onSkip?: (ruleId: string, date: string) => void
  /** `ruleId:date` of the skip in flight. */
  skipping?: string | null
  navigate?: Navigate
  /** Drawn right under the page header, in every state of the page: the app's offline status. */
  intro?: ComponentChildren
}

/**
 * A household's repeating entries at `/recurring`: the dates coming up in the next
 * 30 days across every rule, each with Skip, then each rule with its repeat in
 * words, its next date and why it is paused. "New repeating entry" and each rule's title lead to
 * the editor. A viewer reads both lists with no action.
 */
export function RecurringScreen(props: RecurringScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const { locale } = useFormat()
  const [asking, setAsking] = useState<UpcomingRow | null>(null)
  if (!group) {
    return (
      <Stack gap="xl">
        <PageHeader title={t.t(`Recurring.title`)} />
        {props.intro}
        <NoGroup loading={props.loading} navigate={navigate} />
      </Stack>
    )
  }
  const canWrite = group.canWrite
  return (
    <Stack gap="xl">
      <PageHeader
        title={t.t(`Recurring.title`)}
        subtitle={group.name}
        subtitleDataE2E="recurring-group"
        action={canWrite && (
          <PageAction
            label={t.t(`Recurring.new`)}
            Icon={IconPlus}
            href={RECURRING_PATHS.new}
            navigate={navigate}
            dataE2E="recurring-new"
          />
        )}
      />
      {props.intro}
      <Stack>
        {!canWrite && (
          <p class="text-sm text-muted" data-e2e="recurring-read-only">
            {t.t(`Recurring.readOnly`)}
          </p>
        )}
        {props.listPlan
          ? <PlanRefusalNotice groupId={group.id} refusal={props.listPlan} navigate={navigate} />
          : <ErrorState message={messageText(t, props.listError)} />}
        {props.rules.length === 0
          ? (
            <ListEmpty
              title={props.loading ? t.t(`Recurring.loading`) : t.t(`Recurring.empty`)}
              description={props.loading || !canWrite ? undefined : t.t(`Recurring.emptyHint`)}
              action={!props.loading && canWrite && (
                <Button
                  href={RECURRING_PATHS.new}
                  navigate={navigate}
                  class="min-h-11 sm:min-h-9"
                  data-e2e="recurring-new-empty"
                >
                  {t.t(`Recurring.new`)}
                </Button>
              )}
            />
          )
          : (
            <>
              <Section id="recurring-upcoming" title={t.t(`Recurring.upcoming`)}>
                {props.upcoming.length === 0
                  ? (
                    <p class="px-1 text-sm text-muted" data-e2e="recurring-upcoming-empty">
                      {t.t(`Recurring.upcomingEmpty`)}
                    </p>
                  )
                  : (
                    <ListCard dataE2E="recurring-upcoming-list">
                      {props.upcoming.map((row) => (
                        <li
                          key={`${row.rule.id}:${row.date}`}
                          class="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6"
                          data-e2e={`recurring-upcoming-${row.rule.id}-${row.date}`}
                        >
                          <div class="flex min-w-0 flex-1 flex-col gap-1">
                            <span class="text-sm text-muted" data-e2e="recurring-upcoming-date">
                              {relativeDayLabel(row.date, props.today, locale)}
                            </span>
                            <span class="min-w-0 break-words font-medium">
                              <bdi>{row.rule.title}</bdi>
                            </span>
                            {row.rule.paused !== null && <PausedBadge reason={row.rule.paused} />}
                          </div>
                          <EntryAmount
                            amount={row.rule.amount}
                            currency={row.rule.currency}
                            class="shrink-0 font-medium"
                          />
                          {canWrite && props.onSkip && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              class={`shrink-0 ${TOUCH_TARGET}`}
                              busy={props.skipping === `${row.rule.id}:${row.date}`}
                              aria-label={t.t(`Recurring.skipNamed`, {
                                name: row.rule.title,
                                date: dayLabel(row.date, locale),
                              })}
                              onClick={() => setAsking(row)}
                              data-e2e="recurring-skip"
                            >
                              {t.t(`Recurring.skip`)}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ListCard>
                  )}
              </Section>
              <Section id="recurring-rules" title={t.t(`Recurring.rules`)}>
                <ListCard dataE2E="recurring-list">
                  {props.rules.map((rule) => (
                    <RuleItem key={rule.id} rule={rule} canWrite={canWrite} navigate={navigate} />
                  ))}
                </ListCard>
              </Section>
            </>
          )}
      </Stack>
      {asking && (
        <ConfirmDialog
          title={t.t(`Recurring.skipTitle`, {
            name: asking.rule.title,
            date: dayLabel(asking.date, locale),
          })}
          message={t.t(`Recurring.skipMessage`)}
          confirmLabel={t.t(`Recurring.skipConfirm`)}
          cancelLabel={t.t(`Recurring.cancel`)}
          dataE2E="recurring-skip-dialog"
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null)
            props.onSkip?.(asking.rule.id, asking.date)
          }}
        />
      )}
    </Stack>
  )
}

/** A titled part of the page: a small heading over its list. */
function Section(
  { id, title, children }: { id: string; title: string; children: ComponentChildren },
): JSX.Element {
  return (
    <section aria-labelledby={id + `-title`} class="flex flex-col gap-2" data-e2e={id}>
      <h2 id={id + `-title`} class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * One rule: what it makes (its title, a link to the editor for an editor, and the amount), then
 * its repeat in words, its next date and its account, and why it is paused.
 */
function RuleItem(
  { rule, canWrite, navigate }: {
    rule: RecurringRuleRow
    canWrite: boolean
    navigate?: Navigate
  },
): JSX.Element {
  const t = useAppText()
  const { locale } = useFormat()
  const title = <bdi>{rule.title}</bdi>
  return (
    <li
      class="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-6"
      data-e2e={`recurring-${rule.id}`}
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        {canWrite
          ? (
            <Link
              href={RECURRING_PATHS.rule(rule.id)}
              navigate={navigate}
              class="min-w-0 line-clamp-2 break-words rounded-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus"
              data-e2e="recurring-title"
            >
              {title}
            </Link>
          )
          : (
            <span class="min-w-0 line-clamp-2 break-words font-medium" data-e2e="recurring-title">
              {title}
            </span>
          )}
        <span class="text-sm text-muted" data-e2e="recurring-repeat">{rule.repeat}</span>
        <span class="text-sm text-muted" data-e2e="recurring-next">
          {rule.next === null
            ? t.t(`Recurring.ended`)
            : t.t(`Recurring.next`, { date: dayLabel(rule.next, locale) })}
          {` · `}
          <bdi>{rule.accountName}</bdi>
        </span>
        {rule.paused !== null && <PausedBadge reason={rule.paused} />}
      </div>
      <EntryAmount amount={rule.amount} currency={rule.currency} class="shrink-0 font-medium" />
    </li>
  )
}
