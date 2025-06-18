import { Event, EventConstructor } from "./types.ts"

/**
 * EventBus class for managing event listeners and emitting events.
 * It allows subscribing to events, unsubscribing, and emitting events to all listeners.
 * It is type-safe and can be used to create custom events.
 *
 * @example
 * ```typescript
 * // define an event class
 * class UserCreatedEvent implements Event<{ userId: number; name: string }> {
 *  constructor(public data: { userId: number; name: string }) {}
 * }
 *
 * const eventBus = new EventBus();
 *
 * // subscribe to the event
 * const unsubscribe = eventBus.on(UserCreatedEvent, (event) => {
 *  console.log("User created:", event);
 * });
 *
 * // somewhere in your code, emit the event
 * eventBus.emit(new UserCreatedEvent({ userId: 1, name: "John Doe" }));
 * eventBus.emit(new UserCreatedEvent({ userId: 2, name: "Jane Smith" }));
 * unsubscribe();
 * eventBus.emit(new UserCreatedEvent({ userId: 3, name: "Bob Johnson" })); // this won't be logged
 * ```
 */
export class EventBus {
  private listeners: Map<
    EventConstructor<Event<unknown>>,
    Array<(event: Event<unknown>) => void>
  > = new Map()

  on<T extends Event<unknown>>(
    eventClass: EventConstructor<T>,
    callback: (event: T) => void,
  ): () => void {
    if (!this.listeners.get(eventClass)) {
      this.listeners.set(eventClass, [])
    }
    this.listeners.get(eventClass)!.push(callback as (event: Event<unknown>) => void)
    return () => {
      const callbacks = this.listeners.get(eventClass) || []
      this.listeners.set(eventClass, callbacks.filter((cb) => cb !== callback))
    }
  }

  once<T extends Event<unknown>>(
    eventClass: EventConstructor<T>,
    callback: (event: T) => void,
  ): () => void {
    const unsubscribe = this.on(eventClass, (event) => {
      callback(event)
      unsubscribe()
    })
    return unsubscribe
  }

  emit<T extends Event<unknown>>(event: T): void {
    queueMicrotask(() => {
      const eventClass = event.constructor as EventConstructor<T>
      const callbacks = this.listeners.get(eventClass)
      if (callbacks) {
        for (const callback of callbacks) {
          callback(event as Event<unknown>)
        }
      }
    })
  }
}
