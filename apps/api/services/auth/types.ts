import { User, UserKey, UserSession } from "@shared/types"

export interface AuthData {
  user: User
  key: UserKey
  session: UserSession
}

export const SESSION_ID_COOKIE_NAME = "sessionIdToken"
