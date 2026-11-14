import {
  canManageMember,
  canMutateNotes,
  canRename,
  GroupInvitationCreateCommand,
  GroupMemberRoleCommand,
  GroupMoveAllCommand,
  invitableRoles,
} from "@domain/groups"
import { NoteCreateCommand, NoteMoveCommand, NoteRestoreCommand } from "@domain/notes"
import { CategoryArchiveCommand, CategoryCreateCommand } from "@domain/categories"
import { AccountCreateCommand, AccountRestoreCommand } from "@domain/accounts"
import { TransactionCreateCommand, TransactionRestoreCommand } from "@domain/transactions"
import { TransferCreateCommand, TransferRestoreCommand } from "@domain/transfers"
import { RecurringRuleCreateCommand, RecurringRuleRestoreCommand } from "@domain/recurring"
import {
  BudgetMethod,
  BudgetMethodSetCommand,
  BudgetMoveCommand,
  BudgetSetCommand,
} from "@domain/budgets"
import { type EntitlementNeeds, needsFeature, needsRoom } from "./entitlement-gate.ts"

/**
 * Every command a plan can refuse, in one list (`docs/billing-plans.md`, "What each plan allows"). A command not
 * listed here is never refused for its plan, and no query is.
 */
export const ENTITLEMENT_NEEDS: EntitlementNeeds = new Map([
  needsRoom(
    NoteCreateCommand,
    "maxNotes",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // A restored note is live again and counts, so a full group cannot restore one. A viewer is not
  // judged, so the handler answers "not an editor" (403) before the plan answers 402.
  needsRoom(
    NoteRestoreCommand,
    "maxNotes",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // A move adds its notes to the target group: the gate checks room for one there, and the write
  // counts all of them. A person who cannot write in the source is not judged, so the handler
  // answers "not an editor" (403) before a full target's plan answers 402.
  needsRoom(
    NoteMoveCommand,
    "maxNotes",
    (command) => command.data.toGroupId,
    async (actor, command, _roleOf, roleIn) => {
      if (!canMutateNotes(actor)) return false
      const source = await roleIn(command.data.groupId, command.data.actor.userId)
      return source !== null && canMutateNotes(source)
    },
  ),
  // Moving a whole group adds every one of its rows to the target group, and how many is not known
  // here. The gate is judged to refuse nothing (`judges` is `false`) but still reads every cap of
  // the target's plan into `allowances` (the limit named here is only the entry's key); each
  // movable aggregate counts what it moves under the group's lock against its own cap and refuses
  // the move that would pass it, so a group with nothing to move is never refused for a full
  // target.
  needsRoom(GroupMoveAllCommand, "maxNotes", (command) => command.data.toGroupId, () => false),
  // Pending invitations take no seat: the cap counts members, here and again when one accepts.
  needsRoom(
    GroupInvitationCreateCommand,
    "maxMembers",
    (command) => command.data.groupId,
    (actor, command) => invitableRoles(actor).includes(command.data.role),
  ),
  // An account added, or restored from the trash, counts against the household's plan. Every other
  // account write (edit, archive, default, delete) passes on every plan, so a household that
  // stopped paying keeps its accounts in order. A viewer is not judged: the handler answers 403.
  needsRoom(
    AccountCreateCommand,
    "maxAccounts",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsRoom(
    AccountRestoreCommand,
    "maxAccounts",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // A category added, or brought back from the archive, counts against the household's plan: the
  // cap counts categories in use, so an unarchive takes a slot (D1). An edit or an archive passes
  // on every plan.
  needsRoom(
    CategoryCreateCommand,
    "maxCategories",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsRoom(
    CategoryArchiveCommand,
    "maxCategories",
    (command) => command.data.groupId,
    (actor, command) => canMutateNotes(actor) && !command.data.archived,
  ),
  // An entry added, or restored from the trash, counts against the household's plan. An edit or a
  // delete passes on every plan, so a household that stopped paying keeps its books in order.
  needsRoom(
    TransactionCreateCommand,
    "maxTransactions",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsRoom(
    TransactionRestoreCommand,
    "maxTransactions",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // A transfer added or restored takes a slot of the same cap: the plan counts entries and
  // transfers together, so moving money is not a way around it. An edit or a delete passes.
  needsRoom(
    TransferCreateCommand,
    "maxTransactions",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsRoom(
    TransferRestoreCommand,
    "maxTransactions",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // A repeating entry's rule added or restored counts the same way; editing, skipping a date or
  // deleting one passes on every plan.
  needsRoom(
    RecurringRuleCreateCommand,
    "maxRecurringRules",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsRoom(
    RecurringRuleRestoreCommand,
    "maxRecurringRules",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  // Setting a limit's amount needs the plan; removing one passes on every plan, so a household
  // that stopped paying can still take a limit away. A viewer is not judged: the handler answers
  // 403 before the plan answers 402.
  needsFeature(
    BudgetSetCommand,
    "budgets",
    (command) => command.data.groupId,
    (actor, command) => canMutateNotes(actor) && command.data.amount !== null,
  ),
  // Envelopes are budgets too: switching to them and moving money need the plan, and switching
  // back to monthly limits passes on every plan, so a household that stopped paying can leave
  // envelopes. A role the handler refuses is not judged: it answers 403 before the plan's 402.
  needsFeature(
    BudgetMethodSetCommand,
    "budgets",
    (command) => command.data.groupId,
    (actor, command) => canRename(actor) && command.data.method === BudgetMethod.ENVELOPES,
  ),
  needsFeature(
    BudgetMoveCommand,
    "budgets",
    (command) => command.data.groupId,
    (actor) => canMutateNotes(actor),
  ),
  needsFeature(
    GroupMemberRoleCommand,
    "memberRoles",
    (command) => command.data.groupId,
    // Only a promotion needs the feature, so a group back on the free plan can still demote an
    // admin it made on Pro. A change the handler refuses on every plan (a member who has left, a
    // change the actor may not make) goes on to the handler and gets its own answer.
    async (actor, command, roleOf) => {
      const target = await roleOf(command.data.userId)
      return target !== null && canManageMember(actor, target, command.data.role) &&
        command.data.role > target
    },
  ),
])
