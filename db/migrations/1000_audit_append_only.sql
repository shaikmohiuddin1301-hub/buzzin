-- Audit history is append-only.
--
-- The application never updates or deletes audit rows, but "we never do that" is a
-- convention, not a control. These triggers make it a property of the database: an
-- UPDATE or DELETE against audit_logs aborts, whether it comes from application code,
-- an ad-hoc script or a SQL client pointed at the file.
--
-- Maintenance note: `db/seed.ts` and `db/reset.ts` are the only supported way to clear
-- a development database. The seed captures and restores every trigger around its wipe
-- so this guard survives reseeding; nothing else should need to bypass it.
--
-- Retention: rows referenced by deleted accounts are intentionally kept with their
-- actor id, because audit history outlives the records it describes. Account deletion is
-- anonymisation, not history erasure (see docs/DATA-MODEL.md and docs/SECURITY.md).

CREATE TRIGGER IF NOT EXISTS audit_logs_block_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only: updates are not permitted');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_block_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only: deletes are not permitted');
END;
