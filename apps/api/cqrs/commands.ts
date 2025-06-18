import { Command } from "@shared/cqrs/types.ts"
import { Group, GroupBase, GroupMembership } from "@shared/types"

export interface GroupCreatePayload {
  group: GroupBase
  userId: number
  role?: number // Defaults to 3 (Owner)
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
