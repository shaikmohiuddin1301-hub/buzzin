-- Message requests.
--
-- A direct conversation opened by someone you do not work with starts as a
-- pending request for the recipient instead of landing in the inbox. Existing
-- memberships were already in the inbox, so they are accepted by default and the
-- migration changes nothing for them.
ALTER TABLE conversation_members ADD COLUMN request_status TEXT NOT NULL DEFAULT 'accepted';

CREATE INDEX IF NOT EXISTS conversation_members_request_idx
  ON conversation_members (user_id, request_status);
