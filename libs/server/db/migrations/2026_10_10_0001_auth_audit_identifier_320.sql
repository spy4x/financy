-- #191: the sign-up audit row stores the address, which can be 254 characters (320 with the
-- longest local part), but the column held 100. Widening a VARCHAR keeps every existing row.
ALTER TABLE auth_audits ALTER COLUMN identifier TYPE VARCHAR(320);
