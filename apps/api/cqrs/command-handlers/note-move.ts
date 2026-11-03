import { NoteMoveCommand } from "@domain/notes"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createNoteMoveHandler } from "../../features/notes/handlers.ts"
import { noteDependencies } from "../note-dependencies.ts"

export const noteMoveHandler: CommandHandler<NoteMoveCommand> = createNoteMoveHandler(
  noteDependencies,
)
