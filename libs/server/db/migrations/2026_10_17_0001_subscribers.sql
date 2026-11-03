-- Mail subscriptions for visitors (spy4x/template#213).
--
-- The first three tables are SUBSCRIBERS_POSTGRES_SCHEMA from @spy4x/server/subscribers/postgres,
-- copied verbatim: the library's store and send log read and write them. A list is a plain string
-- (`news`); every row carries it.
CREATE TABLE subscribers (
  list_id text NOT NULL,
  email text NOT NULL,
  key text NOT NULL,
  subscribed_at timestamptz NOT NULL,
  PRIMARY KEY (list_id, email),
  CONSTRAINT subscribers_list_key_unique UNIQUE (list_id, key)
);

CREATE INDEX idx_subscribers_list_subscribed ON subscribers (list_id, subscribed_at);

CREATE TABLE subscriber_unsubscribes (
  list_id text NOT NULL,
  mark text NOT NULL,
  unsubscribed_at timestamptz NOT NULL,
  PRIMARY KEY (list_id, mark)
);

CREATE INDEX idx_subscriber_unsubscribes_at ON subscriber_unsubscribes (list_id, unsubscribed_at);

CREATE TABLE subscriber_sends (
  list_id text NOT NULL,
  issue text NOT NULL,
  subject text NOT NULL,
  started_at timestamptz NOT NULL,
  audience text[],
  recipients text[],
  sent integer,
  failed integer,
  completed_at timestamptz,
  PRIMARY KEY (list_id, issue)
);

-- One row per mail the worker has not sent yet: a confirm link after POST /api/subscribers, or a
-- welcome mail after a confirm. A job in outbox_events carries no payload, so the job points at
-- this row by id. The API writes the row and the job the same way for a known and a new address,
-- and only the worker signs a token. The worker deletes the row once it has handled it; the nightly
-- cleanup removes rows it never reached.
CREATE TABLE subscription_requests (
  id UUID PRIMARY KEY,
  list_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT subscription_requests_email_check CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE INDEX idx_subscription_requests_created ON subscription_requests (created_at);

-- The rendered issue `deno task subscribers:send` stores for the send-issue job, which points at it
-- by id. `html` and `text` hold the unsubscribe placeholder that sendIssue fills per recipient.
-- Kept after the send, so a rerun of the same issue mails only the addresses the first run missed.
CREATE TABLE subscriber_issue_content (
  id UUID PRIMARY KEY,
  list_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT subscriber_issue_content_list_issue_unique UNIQUE (list_id, issue_id)
);
