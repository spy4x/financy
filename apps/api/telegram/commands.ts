/**
 * Financy's own Telegram commands (docs/telegram.md): the one file a product edits to extend the
 * bot. Each handler runs as the linked person, with their `actor` on every message it dispatches,
 * so the buses check what it may read and do as they do for the app.
 *
 * `/expense` and `/income` add an entry (`entries.ts`). `/transfer` moves money between two of the
 * household's accounts (`transfers.ts`). `/balance` and `/month` read the household's figures
 * (`reads.ts`).
 *
 * @module
 */

import { createEntryCommands, type EntryDeps } from "./entries.ts"
import type { TelegramProduct } from "./extension.ts"
import { createReadCommands, type ReadDeps } from "./reads.ts"
import { createTransferCommands } from "./transfers.ts"

/** What Financy's commands dispatch through, and where their talks are kept. */
export type TelegramProductDeps = EntryDeps & ReadDeps

/** Financy's commands, button presses and conversations. */
export function createTelegramProduct(deps: TelegramProductDeps): TelegramProduct {
  const entries = createEntryCommands(deps)
  const transfers = createTransferCommands(deps)
  return {
    commands: [...entries.commands, ...transfers.commands, ...createReadCommands(deps).commands],
    callbacks: { ...entries.callbacks, ...transfers.callbacks },
    conversations: { ...entries.conversations, ...transfers.conversations },
  }
}
