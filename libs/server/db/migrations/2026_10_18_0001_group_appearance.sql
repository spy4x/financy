-- #134: a group has a description, a colour and an emoji, so groups that look alike in the picker
-- can be told apart. The description is empty when unset; the colour is a palette name checked in
-- the domain (`GROUP_COLORS`), null when unset; the emoji is one grapheme, null when unset.
-- Existing groups keep their rows as they are and read as having none of the three.

ALTER TABLE groups
    ADD COLUMN description VARCHAR(2000) DEFAULT '' NOT NULL,
    ADD COLUMN color VARCHAR(16),
    ADD COLUMN emoji VARCHAR(32),
    ADD CONSTRAINT groups_description_check CHECK (char_length(description) <= 500);
