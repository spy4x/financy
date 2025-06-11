import { Event } from "@shared/event-bus"
import { User } from "@shared/types"

export class UserAuthenticatedOnAppStart implements Event {
  constructor(public data: User) {}
}

export class UserSignedIn implements Event {
  constructor(public data: User) {}
}

export class UserSignedUp implements Event {
  constructor(public data: User) {}
}

export class UserSignedOut implements Event {}

export class UserAuthenticationFailed implements Event {
}

export class WSConnected implements Event {}
