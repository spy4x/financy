-- #151: a person sees where they are signed in and ends a session on another device. Each session
-- keeps a friendly device name parsed once from the user agent at sign-in ("Firefox on Linux"),
-- the sign-in address with its last part hidden (`203.0.113.*`, never the full address), and when
-- it was last used, written at most every few minutes. Sessions from before this migration have no
-- device name and no address, and count as last used when they were created.
ALTER TABLE auth_sessions
  ADD COLUMN device_name text NOT NULL DEFAULT '',
  ADD COLUMN ip_hint text,
  ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT auth_sessions_device_name_check CHECK (length(device_name) <= 100),
  ADD CONSTRAINT auth_sessions_ip_hint_check CHECK (length(ip_hint) <= 45);

UPDATE auth_sessions SET last_used_at = created_at;

-- 7 = the person ended one of their other sessions, or all of them.
ALTER TABLE auth_audits
    DROP CONSTRAINT auth_audits_event_type_check,
    ADD CONSTRAINT auth_audits_event_type_check
        CHECK (event_type = ANY (ARRAY[1, 2, 3, 4, 5, 6, 7])) NOT VALID;
ALTER TABLE auth_audits VALIDATE CONSTRAINT auth_audits_event_type_check;
