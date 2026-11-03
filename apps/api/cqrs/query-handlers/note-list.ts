import { NoteListQuery } from "@domain/notes"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createNoteListHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteListHandler: QueryHandler<NoteListQuery> = createNoteListHandler(
  noteDependencies,
)
