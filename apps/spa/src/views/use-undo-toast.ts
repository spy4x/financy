import { effect, type ReadonlySignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { useHotkeys } from "@spy4x/preact-ui/hotkeys"
import { keyFaces } from "@spy4x/preact-ui/kbd"
import { isApplePlatform } from "@spy4x/platform/browser/hotkeys"
import type { UndoOffer } from "../state/notes.ts"
import { toasts } from "../state/toasts.ts"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { useAppText } from "@ui/i18n.ts"
import { isolate } from "@spy4x/preact-ui/bdi"

/** The key that takes a deleted item back while its toast shows. */
export const UNDO_KEYS = "mod+z"

/** What the hook reads from a store that offers Undo after a delete. */
export interface UndoStore<Offer extends { id: string; until: number }> {
  undo: ReadonlySignal<Offer | null>
  undoDelete(): Promise<unknown>
  dismissUndo(): void
}

/** The toast's words for one offer, and the `data-e2e` name its toast and button carry. */
export interface UndoText<Offer> {
  /** `<e2e>-undo-toast` on the toast and `<e2e>-undo` on its button. */
  e2e: string
  title(t: Translator<string>, offer: Offer): string
  body(t: Translator<string>, offer: Offer): string
}

/** A deleted note's toast: "Note deleted" and its title. */
export const NOTE_UNDO_TEXT: UndoText<UndoOffer> = {
  e2e: `note`,
  title: (t) => t.t(`UndoToast.title`),
  body: (t, offer) =>
    offer.title
      ? t.t(`UndoToast.deleted`, { title: isolate(offer.title) })
      : t.t(`UndoToast.deletedUntitled`),
}

/**
 * The toast's hint for {@link UNDO_KEYS}, as the platform writes the key ("Ctrl+Z", "⌘Z"), or
 * nothing on a device without a fine pointer, where a keyboard is unlikely. Read when the toast is
 * pushed, in the browser, never during render.
 */
function undoKeyHint(t: Translator<string>): string {
  if (globalThis.matchMedia?.("(pointer: fine)").matches === false) return ""
  const apple = isApplePlatform()
  const key = keyFaces(UNDO_KEYS, apple).map((face) => face.text).join(apple ? "" : "+")
  return ` ${t.t(`UndoToast.keyHint`, { key })}`
}

/**
 * Shows the toast that follows a delete in the app's one toast list: what was deleted, in the
 * words `text` gives, and an Undo button. It lasts as long as the offer does, and goes when the
 * offer ends or the page leaves the screen. An offer that ended while another page was open is not
 * shown late.
 *
 * While the offer lasts, Ctrl Z (⌘Z on a Mac) takes the item back too, so a keyboard user need not
 * Tab past every row to reach the toast. A press in a text field keeps the field's own undo.
 */
export function useUndoToast<Offer extends { id: string; until: number }>(
  store: UndoStore<Offer>,
  text: UndoText<Offer>,
): void {
  const offer = store.undo.value
  const t = useAppText()
  useHotkeys([{ keys: UNDO_KEYS, handler: () => void store.undoDelete() }], {
    enabled: offer !== null,
  })
  useEffect(() => {
    if (!offer) return
    const left = offer.until - Date.now()
    if (left <= 0) return
    toasts.info({
      id: offer.id,
      title: text.title(t, offer),
      body: text.body(t, offer) + undoKeyHint(t),
      duration: left,
      dataE2E: `${text.e2e}-undo-toast`,
      action: {
        label: t.t(`UndoToast.undo`),
        dataE2E: `${text.e2e}-undo`,
        onAction: () => void store.undoDelete(),
      },
    })
    // Dismiss and the toast's own timer take it off the list: that ends the offer too, so it does
    // not come back when the person returns to the page.
    const stop = effect(() => {
      if (!toasts.list.value.some((toast) => toast.id === offer.id)) store.dismissUndo()
    })
    return () => {
      stop()
      toasts.remove(offer.id)
    }
  }, [offer, store])
}
