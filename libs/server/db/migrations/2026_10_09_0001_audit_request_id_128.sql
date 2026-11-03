-- #217: a socket frame id can be 128 characters (@spy4x/realtime codec) and is stored as the audit
-- row's request id, but the column held 100. Widening a VARCHAR keeps every existing row.
ALTER TABLE audit_events ALTER COLUMN request_id TYPE VARCHAR(128);
