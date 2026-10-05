-- The existing worker assignment preview functions run from the private
-- schema. Restore schema access for authenticated callers while keeping the
-- scheduler function itself inaccessible through its explicit EXECUTE revoke.
grant usage on schema private to authenticated;
