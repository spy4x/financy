import { NoteLocateQuery } from "@domain/notes"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createNoteLocateHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteLocateHandler: QueryHandler<NoteLocateQuery> = createNoteLocateHandler(
  noteDependencies,
)
