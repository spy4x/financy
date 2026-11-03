import type { AppAuthState } from "../services/sign-in.ts"
import { SecondFactorStatus, SessionStatus } from "@spy4x/server/sign-in"
import { UserMFAStatus, UserRole } from "@domain/identity"

type AuthOverrides = {
  user?: Partial<AppAuthState["user"]>
  session?: Partial<AppAuthState["session"]>
}

export function buildAuthData(
  overrides: AuthOverrides = {},
): AppAuthState {
  const now = new Date("2026-01-26T08:00:00.000Z")
  return {
    user: {
      id: 1,
      firstName: "Test",
      lastName: "User",
      role: 1 as UserRole,
      mfa: 1 as UserMFAStatus,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides.user,
    },
    session: {
      id: 1,
      userId: 1,
      keyId: 1,
      tokenHash: "token-hash",
      status: SessionStatus.Active,
      secondFactor: SecondFactorStatus.NotRequired,
      expiresAt: new Date("2026-02-01T08:00:00.000Z"),
      ...overrides.session,
    },
  }
}
