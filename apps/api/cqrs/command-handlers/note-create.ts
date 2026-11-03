import { NoteCreateCommand } from "@domain/notes"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createNoteCreateHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteCreateHandler: CommandHandler<NoteCreateCommand> = createNoteCreateHandler(
  noteDependencies,
)
