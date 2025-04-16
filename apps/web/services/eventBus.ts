// implement type-safe eventBus that can be used on frontend to publish and subscribe to events

// export interface Event {
//   key: string
//   data?: unknown
// }

// export class EventBus {
//   private listeners: Map<string, Array<(event: Event) => void>> = new Map()

//   subscribe<T extends Event>(event: T, callback: (event: T) => void): () => void {
//     if (!this.listeners.get(event.key)) {
//       this.listeners.set(event.key, [])
//     }
//     this.listeners.get(event.key)!.push(callback as (event: Event) => void)
//     return () => {
//       const callbacks = this.listeners.get(event.key) || []
//       this.listeners.set(event.key, callbacks.filter((cb) => cb !== callback))
//     }
//   }

//   publish<T extends Event>(event: T): void {
//     const callbacks = this.listeners.get(event.key)
//     if (callbacks) {
//       for (const callback of callbacks) {
//         callback(event as Event)
//       }
//     }
//   }
// }

// export const eventBus = new EventBus()

// class UserCreatedEvent implements Event {
//     key = "userCreated";
//     data: { userId: number; name: string };

//     constructor(userId: number, name: string) {
//         this.data = { userId, name };
//     }
// }

// const userCreatedEvent = new UserCreatedEvent(1, "John Doe");
// const unsubscribe = eventBus.subscribe(UserCreatedEvent, (event) => { console.log("User created:", event) })
// eventBus.publish(userCreatedEvent);

export interface Event {
  data?: unknown
}

type EventConstructor<T extends Event> = new (...args: any[]) => T

export class EventBus {
  private listeners: Map<EventConstructor<Event>, Array<(event: Event) => void>> = new Map()

  on<T extends Event>(
    eventClass: EventConstructor<T>,
    callback: (event: T) => void,
  ): () => void {
    if (!this.listeners.get(eventClass)) {
      this.listeners.set(eventClass, [])
    }
    this.listeners.get(eventClass)!.push(callback as (event: Event) => void)
    return () => {
      const callbacks = this.listeners.get(eventClass) || []
      this.listeners.set(eventClass, callbacks.filter((cb) => cb !== callback))
    }
  }

  once<T extends Event>(
    eventClass: EventConstructor<T>,
    callback: (event: T) => void,
  ): () => void {
    const unsubscribe = this.on(eventClass, (event) => {
      callback(event)
      unsubscribe()
    })
    return unsubscribe
  }

  emit<T extends Event>(event: T): void {
    const eventClass = event.constructor as EventConstructor<T>
    const callbacks = this.listeners.get(eventClass)
    if (callbacks) {
      for (const callback of callbacks) {
        callback(event as Event)
      }
    }
  }
}

export const eventBus = new EventBus()

class UserCreatedEvent implements Event {
  constructor(public data: { userId: number; name: string }) {
  }
}

const unsubscribe = eventBus.on(UserCreatedEvent, (event) => {
  console.log("User created:", event)
})

eventBus.emit(new UserCreatedEvent({ userId: 1, name: "John Doe" }))
eventBus.emit(new UserCreatedEvent({ userId: 2, name: "Jane Smith" }))
unsubscribe()
eventBus.emit(new UserCreatedEvent({ userId: 3, name: "Bob Johnson" }))
