import { Event } from "@shared/event-bus"
import { User } from "@shared/types"

export class UserAuthenticatedOnAppStart implements Event {
  public data: { user: { id: number } }
  constructor(userId: number) {
    this.data = { user: { id: userId } }
  }
}

export class UserSignedIn implements Event {
  constructor(public data: User) {}
}

export class UserSignedUp implements Event {
  constructor(public data: User) {}
}

export class UserSignedOut implements Event {}
