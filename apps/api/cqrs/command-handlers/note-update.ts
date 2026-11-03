import { NoteUpdateCommand } from "@domain/notes"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createNoteUpdateHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteUpdateHandler: CommandHandler<NoteUpdateCommand> = createNoteUpdateHandler(
  noteDependencies,
)
