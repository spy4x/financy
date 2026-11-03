-- #165: starter data on sign-up. Sign-up writes one row here and queues a worker job that names it.
-- The job creates the welcome note in the person's first group, then sets `done_at` in a second
-- write. The note's id is the request's id, so a job that runs again, even after a crash between
-- the two writes, finds the note and adds none. One row per user: the unique key
-- also stops a second request. The row goes with the auth user.
CREATE TABLE starter_data_requests (
    id UUID PRIMARY KEY,
    user_id INT4 NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    done_at TIMESTAMPTZ
);
