import { NoteDeleteCommand } from "@domain/notes"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createNoteDeleteHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteDeleteHandler: CommandHandler<NoteDeleteCommand> = createNoteDeleteHandler(
  noteDependencies,
)
