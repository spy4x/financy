import { NoteRestoreCommand } from "@domain/notes"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createNoteRestoreHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteRestoreHandler: CommandHandler<NoteRestoreCommand> = createNoteRestoreHandler(
  noteDependencies,
)
