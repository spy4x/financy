import type { JSX } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { CurrencyField } from "@spy4x/preact-ui/currency-field"
import { DialogActions } from "@spy4x/preact-ui/dialog-actions"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { Rich } from "@spy4x/preact-ui/i18n"
import { Stack } from "@spy4x/preact-ui/layout"
import { Modal } from "@spy4x/preact-ui/modal"
import { Notice } from "@spy4x/preact-ui/notice"
import { TOUCH_TARGET } from "@spy4x/preact-ui/page-header"
import { SettingGroup, SettingList, SettingRow } from "@spy4x/preact-ui/setting-row"
import { isolate } from "@spy4x/preact-ui/bdi"
import { type CurrencyOption, currencyOptions } from "@spy4x/platform/universal/money-core"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { HouseholdSettingsView } from "@domain/money"
import { ScreenForm } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"

/** The `id` of the dialog's currency field. */
const CURRENCY_FIELD_ID = `group-currency-field`

export interface GroupCurrencySectionProps {
  /** The group's settings and the currencies this server has a daily rate for; `null` until read. */
  view: HouseholdSettingsView | null
  /** Why the settings could not be read, or `null`. */
  loadError?: string | null
  /** The person is an admin or the owner, who may change the main currency. */
  canChange: boolean
  /** The browser has no network: a change cannot be sent. */
  offline: boolean
  /** The dialog is open. */
  dialogOpen: boolean
  onOpen: () => void
  onClose: () => void
  /** Saves the chosen code; the app closes the dialog when the save worked. */
  onSave: (code: string) => void
  saving: boolean
  /** Why the last save was refused, shown in the dialog, or `null`. */
  error: string | null
  /** The currency another member saved while the dialog was open, or `null`. */
  changedElsewhere: string | null
}

/** `Euro (EUR)` in the page's language, from the currency's localized name. */
export function currencyLabel(
  t: Translator<string>,
  options: readonly CurrencyOption[],
  code: string,
): string {
  const name = options.find((option) => option.code === code)?.name ?? code
  return t.t(`CurrencyField.option`, { name, code })
}

/**
 * The "Money" section of a group's General tab: the main currency in one row, with the hint under
 * it. An admin or the owner gets "Change", which opens the dialog; anyone else reads the value and
 * who may change it, never a disabled button. Offline, "Change" is disabled and says why.
 */
export function GroupCurrencySection(props: GroupCurrencySectionProps): JSX.Element {
  const { view, canChange, offline, dialogOpen } = props
  const t = useAppText()
  const options = useMemo(() => currencyOptions(t.language, []), [t.language])
  const change = useRef<HTMLButtonElement>(null)
  const hidden = (text: string) => <span class="sr-only">{text}</span>
  const code = view?.settings.baseCurrency ?? null
  // A dialog opened by a link had no trigger to hand focus back to, so it goes to "Change" here.
  const wasOpen = useRef(dialogOpen)
  useEffect(() => {
    if (wasOpen.current && !dialogOpen) change.current?.focus()
    wasOpen.current = dialogOpen
  }, [dialogOpen])
  // The slot follows the group's form with no gap, and the form's fields are `max-w-md` wide.
  return (
    <div class="mt-8 max-w-md">
      <SettingGroup title={t.t(`GroupCurrency.section`)} dataE2E="group-currency">
        <SettingList>
          <SettingRow
            label={t.t(`GroupCurrency.label`)}
            dataE2E="group-currency-row"
            value={
              <span data-e2e="group-currency-value">
                {code === null ? `…` : currencyLabel(t, options, code)}
              </span>
            }
            action={canChange && (
              <Button
                ref={change}
                type="button"
                variant="secondary"
                size="sm"
                class={TOUCH_TARGET}
                disabled={offline || view === null}
                aria-describedby={offline ? `group-currency-offline` : undefined}
                onClick={props.onOpen}
                data-e2e="group-currency-change"
              >
                <Rich parts={t.parts(`GroupCurrency.change`)} tags={{ hidden }} />
              </Button>
            )}
          />
        </SettingList>
        <p class="text-sm text-muted">{t.t(`GroupCurrency.hint`)}</p>
        {!canChange && (
          <p class="text-sm text-muted" data-e2e="group-currency-read-only">
            {t.t(`GroupCurrency.readOnly`)}
          </p>
        )}
        {canChange && offline && (
          <p
            id="group-currency-offline"
            class="text-sm text-muted"
            data-e2e="group-currency-offline"
          >
            {t.t(`GroupCurrency.offline`)}
          </p>
        )}
        <ErrorState message={props.loadError ?? null} dataE2E="group-currency-load-error" />
        {canChange && view && (
          <CurrencyDialog
            {...props}
            view={view}
            options={options}
            open={dialogOpen}
          />
        )}
      </SettingGroup>
    </div>
  )
}

/**
 * Marks the dialog's currency input `autofocus`, so `showModal()` focuses it rather than the close
 * button. A ref, not an effect: the Modal draws its content only once open, and calls
 * `showModal()` from an effect. Focusing the input from this dialog's own effect lost that race
 * whenever the section drew again before the frame's effects ran: Preact then runs a parent's
 * pending effects before its children's, so the focus came first and `showModal()` moved it to
 * the close button. A ref runs as the input is attached, before any effect.
 */
function markAutofocus(wrapper: HTMLDivElement | null): void {
  const input = wrapper?.querySelector(`input`)
  if (input) input.autofocus = true
}

/**
 * The dialog: the currency field, focused, with the current currency chosen; the note that no
 * amount changes; a clash or a refusal; then "Use {name}" and "Cancel". Currencies this server has
 * no daily rate for say so in the list.
 */
function CurrencyDialog(
  props: GroupCurrencySectionProps & {
    view: HouseholdSettingsView
    options: readonly CurrencyOption[]
    open: boolean
  },
): JSX.Element {
  const { view, options, open, saving, error, changedElsewhere } = props
  const t = useAppText()
  const [choice, setChoice] = useState(view.settings.baseCurrency)
  // Each opening starts from the saved currency.
  useEffect(() => {
    if (open) setChoice(view.settings.baseCurrency)
  }, [open])
  const marked = useMemo(() => {
    const rated = new Set(view.ratedCurrencies)
    const note = t.t(`GroupCurrency.noRate`)
    return options.map((option) =>
      rated.has(option.code) ? option : { ...option, name: `${option.name} · ${note}` }
    )
  }, [options, view.ratedCurrencies, t])
  const label = (code: string) => currencyLabel(t, options, code)
  const name = options.find((option) => option.code === choice)?.name ?? choice
  return (
    <Modal
      open={open}
      onClose={props.onClose}
      title={t.t(`GroupCurrency.label`)}
      cancelLabel={t.t(`EmailScreen.close`)}
      dataE2E="group-currency-dialog"
      // The open list may reach past the dialog's foot; scrolling the dialog to it would hide the
      // title and the buttons.
      class="overflow-visible!"
    >
      <ScreenForm pending={saving} onSubmit={() => props.onSave(choice)}>
        <Stack>
          <Field
            id={CURRENCY_FIELD_ID}
            // The dialog's title already says it; the label stays for a screen reader.
            label={<span class="sr-only">{t.t(`GroupCurrency.label`)}</span>}
            hint={t.t(`GroupCurrency.changeNote`)}
          >
            {(wiring) => (
              <div ref={markAutofocus} data-e2e="group-currency-field">
                <CurrencyField
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  value={choice}
                  onChange={(code) => code && setChoice(code)}
                  options={marked}
                  // The closed field reads the plain name, without the list's note.
                  optionLabel={(_, code) => label(code)}
                  required
                />
              </div>
            )}
          </Field>
          {changedElsewhere && (
            <Notice tone="info" data-e2e="group-currency-elsewhere">
              {t.t(`GroupCurrency.changedElsewhere`, { code: isolate(changedElsewhere) })}
            </Notice>
          )}
          <ErrorState focusOnAppear message={error} dataE2E="group-currency-error" />
          <DialogActions>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              {t.t(`GroupEditor.cancel`)}
            </Button>
            <Button
              type="submit"
              busy={saving}
              busyLabel={t.t(`PasswordResetScreen.saving`)}
              data-e2e="group-currency-use"
            >
              {t.t(`GroupCurrency.use`, { name: isolate(name) })}
            </Button>
          </DialogActions>
        </Stack>
      </ScreenForm>
    </Modal>
  )
}
