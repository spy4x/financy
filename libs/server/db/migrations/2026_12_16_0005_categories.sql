-- Categories: why money moved, for expenses or for income (docs/aggregates.md). A category belongs
-- to one household (a group). Every member reads a household's categories and an editor or above
-- writes them; the handlers check that, and every write checks it again on the locked membership
-- row.
--
-- `kind` is 1 expense or 2 income. `icon` is an id of the icon registry's category set and `color`
-- a lower-case `#rrggbb`; the API checks both, the CHECKs keep a hand-written row in shape.
-- `parent_id` puts a category under one top-level parent of its kind, one level deep; the server
-- checks the depth and the kind. The foreign key names the household too, so a parent is always
-- in the child's household, and RESTRICT keeps a parent from going while a child names it.
--
-- A category is archived, never deleted, so every past entry keeps it. Finance rows that name a
-- category will reference it with ON DELETE RESTRICT, never CASCADE. The household's own delete
-- still removes its categories with it (group_id CASCADE).
CREATE TABLE categories (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    parent_id UUID,
    name VARCHAR(60) NOT NULL,
    kind INT2 NOT NULL,
    icon VARCHAR(40) NOT NULL,
    color CHAR(7) NOT NULL,
    archived_at TIMESTAMPTZ(3),
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT categories_group_id_id_key UNIQUE (group_id, id),
    CONSTRAINT categories_parent_fkey FOREIGN KEY (group_id, parent_id)
        REFERENCES categories (group_id, id) ON DELETE RESTRICT,
    CONSTRAINT categories_own_parent_check CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT categories_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    CONSTRAINT categories_kind_check CHECK (kind BETWEEN 1 AND 2),
    CONSTRAINT categories_icon_check CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
    CONSTRAINT categories_color_check CHECK (color ~ '^#[0-9a-f]{6}$'),
    CONSTRAINT categories_version_check CHECK (version >= 1),
    CONSTRAINT categories_change_sequence_check CHECK (change_sequence >= 1)
);

-- The list reads a household's categories through the unique key's group prefix.
CREATE INDEX idx_categories_parent ON categories (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_categories_group_change_sequence ON categories (group_id, change_sequence);
CREATE INDEX idx_categories_created_by ON categories (created_by_user_id);
CREATE INDEX idx_categories_updated_by ON categories (updated_by_user_id);

-- The language of the page a person signed up on, so the worker names their starter categories in
-- it while they have saved no language of their own. NULL when the sign-up named none.
ALTER TABLE starter_data_requests ADD COLUMN language TEXT;
ALTER TABLE starter_data_requests ADD CONSTRAINT starter_data_requests_language_check
    CHECK (length(language) BETWEEN 2 AND 35);
