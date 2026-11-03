import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupError, GroupRole } from "./+lib.ts"
import {
  assertCanInvite,
  invitableRoles,
  invitableRolesOnPlan,
  INVITATION_DEFAULT_DAYS,
  invitationRefusal,
  parseInvitationCreateBody,
  parseInvitationRef,
} from "./invitations.ts"

const now = new Date("2026-10-02T10:00:00.000Z")
const later = new Date("2026-10-03T10:00:00.000Z")
const earlier = new Date("2026-10-01T10:00:00.000Z")

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof GroupError) return error.code
    throw error
  }
  return "none"
}

describe("invitation rules", () => {
  it("lets an admin invite viewers and editors, the owner admins too, and nobody else anyone", () => {
    expect(invitableRoles(GroupRole.OWNER)).toEqual([
      GroupRole.VIEWER,
      GroupRole.EDITOR,
      GroupRole.ADMIN,
    ])
    expect(invitableRoles(GroupRole.ADMIN)).toEqual([GroupRole.VIEWER, GroupRole.EDITOR])
    expect(invitableRoles(GroupRole.EDITOR)).toEqual([])
    expect(codeOf(() => assertCanInvite(GroupRole.ADMIN, GroupRole.ADMIN))).toBe(
      "ROLE_INSUFFICIENT",
    )
    expect(codeOf(() => assertCanInvite(null, GroupRole.VIEWER))).toBe("GROUP_NOT_FOUND")
  })

  it("lets an invitation add viewers only on a plan without member roles", () => {
    expect(invitableRolesOnPlan(GroupRole.OWNER, false)).toEqual([GroupRole.VIEWER])
    expect(invitableRolesOnPlan(GroupRole.OWNER, true)).toEqual(invitableRoles(GroupRole.OWNER))
    expect(invitableRolesOnPlan(GroupRole.EDITOR, false)).toEqual([])
  })

  it("says why an invitation no longer works: withdrawn first, then used up, then expired", () => {
    const fresh = { revokedAt: null, declinedAt: null, expiresAt: later, uses: 0, maxUses: 1 }
    expect(invitationRefusal(fresh, now)).toBe(null)
    expect(invitationRefusal({ ...fresh, expiresAt: earlier }, now)?.code).toBe(
      "INVITATION_EXPIRED",
    )
    expect(invitationRefusal({ ...fresh, uses: 1, expiresAt: earlier }, now)?.code).toBe(
      "INVITATION_USED_UP",
    )
    expect(invitationRefusal({ ...fresh, declinedAt: earlier, uses: 1 }, now)?.code).toBe(
      "INVITATION_REVOKED",
    )
    expect(invitationRefusal({ ...fresh, revokedAt: earlier }, now)?.code).toBe(
      "INVITATION_REVOKED",
    )
  })
})

describe("invitation request bodies", () => {
  it("fills a create's defaults: seven days, one use, no address, no mail", () => {
    expect(parseInvitationCreateBody({ role: GroupRole.EDITOR })).toEqual({
      role: GroupRole.EDITOR,
      expiresInDays: INVITATION_DEFAULT_DAYS,
      maxUses: 1,
      email: null,
      sendEmail: false,
      acceptSeatPrice: false,
    })
    expect(parseInvitationCreateBody({ role: 1, email: "  ", maxUses: 5 }).email).toBe(null)
  })

  it("carries the creator's confirmation of the per-member price", () => {
    expect(parseInvitationCreateBody({ role: 1, acceptSeatPrice: true }).acceptSeatPrice).toBe(true)
    expect(codeOf(() => parseInvitationCreateBody({ role: 1, acceptSeatPrice: "true" }))).toBe(
      "INVALID_REQUEST",
    )
  })

  it("refuses an owner role, a mail without an address and several uses for one address", () => {
    const refused = [
      { role: GroupRole.OWNER },
      { role: 1, sendEmail: true },
      { role: 1, email: "a@example.com", maxUses: 2 },
      { role: 1, expiresInDays: 31 },
      { role: 1, maxUses: 0 },
      { role: 1, extra: true },
    ]
    for (const body of refused) {
      expect(codeOf(() => parseInvitationCreateBody(body))).toBe("INVALID_REQUEST")
    }
  })

  it("takes exactly a token or exactly an invitation id", () => {
    const token = "A".repeat(43)
    const invitationId = "9c1e4f5a-2b3c-4d5e-8f90-a1b2c3d4e5f6"
    expect(parseInvitationRef({ token })).toEqual({ token })
    expect(parseInvitationRef({ invitationId })).toEqual({ invitationId })
    expect(codeOf(() => parseInvitationRef({ token, invitationId }))).toBe("INVALID_REQUEST")
    expect(codeOf(() => parseInvitationRef({ token: "short" }))).toBe("INVALID_REQUEST")
  })
})
