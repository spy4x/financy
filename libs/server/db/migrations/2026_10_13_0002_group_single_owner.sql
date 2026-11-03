-- #132: a group has exactly one owner. Ownership moves only by a transfer, which demotes the old
-- owner before it promotes the new one; this index refuses any write that would leave two.
CREATE UNIQUE INDEX group_members_one_owner_key ON group_members (group_id) WHERE role = 4;
