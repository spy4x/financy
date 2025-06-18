import { Command, CommandConstructor, CommandHandler, CommandResult } from "./types.ts"

/**
 * CommandBus class for managing command handlers and executing commands.
 * It provides full type safety with automatic result type inference.
 *
 * @example
 * ```typescript
 * // Define payload and result types
 * interface UserCreatePayload {
 *   name: string
 *   email: string
 * }
 *
 * interface UserCreateResult {
 *   id: number
 *   name: string
 *   email: string
 * }
 *
 * // Define command with payload and result types
 * class UserCreateCommand implements Command<UserCreatePayload, UserCreateResult> {
 *    __resultType?: UserCreateResult // Phantom type for result inference
 *   constructor(public data: UserCreatePayload) {}
 * }
 *
 * const commandBus = new CommandBus();
 *
 * // Register handler - return type is automatically inferred as UserCreateResult
 * commandBus.register(UserCreateCommand, async (command) => {
 *   console.log("Creating user:", command.data);
 *   return { id: 1, ...command.data }; // Must return UserCreateResult
 * });
 *
 * // Execute command - result is automatically typed as UserCreateResult
 * const user = await commandBus.execute(new UserCreateCommand({ name: "John", email: "john@example.com" }));
 * ```
 */
export class CommandBus {
  private handlers: Map<
    CommandConstructor<Command<unknown, unknown>>,
    CommandHandler<Command<unknown, unknown>>
  > = new Map()

  register<T extends Command<unknown, unknown>>(
    commandClass: CommandConstructor<T>,
    handler: CommandHandler<T>,
  ): void {
    this.handlers.set(commandClass, handler as CommandHandler<Command<unknown, unknown>>)
  }

  async execute<T extends Command<unknown, unknown>>(command: T): Promise<CommandResult<T>> {
    const CommandClass = command.constructor as CommandConstructor<T>
    const handler = this.handlers.get(CommandClass)

    if (!handler) {
      throw new Error(`No handler registered for command: ${CommandClass.name}`)
    }

    return await handler(command) as CommandResult<T>
  }

  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys()).map((cmd) => cmd.name)
  }
}
