import { Event } from "@shared/cqrs/types.ts"
import { User } from "@shared/types"

export class UserAuthenticatedOnAppStart implements Event<User> {
  constructor(public data: User) {}
}

export class UserSignedIn implements Event<User> {
  constructor(public data: User) {}
}

export class UserSignedUp implements Event<User> {
  constructor(public data: User) {}
}

export class UserSignedOut implements Event<undefined> {
  data = undefined
}

export class UserAuthenticationFailed implements Event<undefined> {
  data = undefined
}

export class WSConnected implements Event<undefined> {
  data = undefined
}
