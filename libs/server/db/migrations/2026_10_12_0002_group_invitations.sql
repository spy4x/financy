-- #131: invitations to a group. A link carries a random token; only its SHA-256 is kept here, so
-- reading this table never gives anyone a working link. An invitation tied to an address may be
-- accepted only by the account that proved that address.
CREATE TABLE group_invitations (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL,
    role INT2 NOT NULL,
    email TEXT,
    max_uses INT4 DEFAULT 1 NOT NULL,
    uses INT4 DEFAULT 0 NOT NULL,
    created_by_user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT group_invitations_role_check CHECK (role BETWEEN 1 AND 3),
    CONSTRAINT group_invitations_max_uses_check CHECK (max_uses BETWEEN 1 AND 100),
    CONSTRAINT group_invitations_uses_check CHECK (uses BETWEEN 0 AND max_uses),
    CONSTRAINT group_invitations_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT group_invitations_email_check
        CHECK (email IS NULL OR length(email) BETWEEN 3 AND 254)
);

COMMENT ON COLUMN group_invitations.role IS '1=viewer, 2=editor, 3=admin';

-- A link finds its invitation by the token's hash.
CREATE UNIQUE INDEX idx_group_invitations_token_hash ON group_invitations (token_hash);
-- The group's Invitations section, newest first.
CREATE INDEX idx_group_invitations_group_created ON group_invitations (group_id, created_at DESC);
-- The invitations a person sees for the addresses they proved.
CREATE INDEX idx_group_invitations_email ON group_invitations (email) WHERE email IS NOT NULL;

-- Who accepted each invitation. A person accepts one invitation once: a member removed from the
-- group cannot come back through the team link they joined with.
CREATE TABLE group_invitation_acceptances (
    invitation_id UUID NOT NULL REFERENCES group_invitations(id) ON DELETE CASCADE,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accepted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (invitation_id, user_id)
);
