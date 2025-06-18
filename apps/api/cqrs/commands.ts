import { Command } from "@shared/cqrs/types.ts"
import { Group, GroupBase, GroupMembership, GroupRole } from "@shared/types"

export interface GroupCreatePayload {
  group: GroupBase
  userId: number
  role?: GroupRole // Defaults to Owner
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface GroupCreateResult {
  group: Group
  membership: GroupMembership
}

export class GroupCreateCommand implements Command<GroupCreatePayload, GroupCreateResult> {
  __resultType?: GroupCreateResult
  constructor(public data: GroupCreatePayload) {}
}
