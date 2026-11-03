import { NoteGetQuery } from "@domain/notes"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createNoteGetHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteGetHandler: QueryHandler<NoteGetQuery> = createNoteGetHandler(
  noteDependencies,
)
