# Worker credential-pair login

Imported workers type the first three letters of their first name and their
initial password (cell number, digits only). A username or password can repeat;
only the exact normalized username/password pair is rejected.

## Deployment

Before enabling imports, configure `WORKER_CREDENTIAL_KEY` as an Edge Function
secret containing at least 32 cryptographically random bytes (encoded as hex or
base64). Keep it stable, backed up securely, and out of client environment variables.
All three functions must use the same key:

- `bulk-create-workers`
- `provision-imported-workers`
- `worker-login` (public endpoint, `verify_jwt = false` in config.toml)

Deploy those functions together with the admin web and mobile changes. No live
accounts are migrated by these changes. Existing email-based accounts remain
unchanged. The previous local-only suffix scheme must not be deployed alongside
this scheme.

The internal Auth email contains a keyed HMAC of the credential pair, not the
password. Supabase's atomic unique-email constraint blocks duplicate pairs even
for concurrent imports. Supabase Auth still checks the password. The login
endpoint never uses the service-role key and returns only session tokens after
checking the worker's active application profile.

This implements import-time credentials; no password-reset/change UI is added.
Future credential changes must update the internal alias and password together,
enforce the same pair uniqueness, and revoke prior sessions. Do not independently
change the password/email in the Supabase dashboard or rotate the HMAC key without
a coordinated credential migration: short-username login would no longer resolve.

Run `node --test scripts/test-worker-portal.mjs` for local mocked provisioning
tests. Before release, verify in a non-production project that both allowed
combinations log into distinct employee profiles, the exact duplicate is rejected,
and disabled/missing profiles cannot sign in. These live checks have not yet run.
