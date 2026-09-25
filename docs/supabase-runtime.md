# Supabase / PostgreSQL runtime

Elara Relay treats Supabase as a PostgreSQL host, not as the owner of the
application architecture.

The server-side runtime needs only `DATABASE_URL`. The browser must never
receive this value.

For a remote Supabase connection, the runtime requires TLS. A URL without an
`sslmode` parameter is normalized to `sslmode=require`. Explicitly disabling
TLS for a remote host is rejected. Local development connections may use
`sslmode=disable`.

The same `PostgresDomainStore` contract is used by Supabase, a local
PostgreSQL service, or another compatible PostgreSQL host.

## Runtime variables

- `DATABASE_URL`: required PostgreSQL connection string.
- `ELARA_DB_POOL_MAX`: maximum pool size, default 5, maximum 20.
- `ELARA_DB_IDLE_TIMEOUT_MS`: idle connection timeout, default 30000.
- `ELARA_DB_CONNECTION_TIMEOUT_MS`: connect timeout, default 10000.

The checked-in `.env.example` contains local placeholders only. Never commit
a production database password or Supabase service-role credential.

## Migration rule

DDL remains source-controlled under `src/db/migrations/`. A live Supabase
project should receive those reviewed migrations through the migration API;
the application runtime does not auto-create or mutate its schema on startup.


## Browser access boundary

Operational tables live in the `public` schema only because Supabase exposes
that schema by default. Elara does not use browser-to-table access.

Migration `0002_security_hardening.sql` enables RLS on all operational tables
and revokes direct table privileges from both `anon` and `authenticated`.
No client policies are installed in Phase 1B. The application server connects
to PostgreSQL directly and remains the only supported mutation/read gateway for
operational data.

The append-only event trigger also pins its function `search_path` to
`pg_catalog, public` so object resolution cannot be redirected by a caller's
role-level search path.


## Application authentication boundary

Operational API routes require a Supabase Auth access token. The public
`/health` endpoint remains unauthenticated; Parties, Jobs, Tasks, Today,
Search, and identity inspection are protected.

The server verifies asymmetric Supabase session JWTs against the project's
JWKS endpoint and validates issuer, audience, expiry, role, anonymous-session
state, and a stable user-ID allowlist. If a project still emits legacy HS256
session tokens, Elara follows Supabase's recommended fallback and validates
the token through `/auth/v1/user` with the project's modern publishable key
rather than storing the legacy JWT secret.

`ELARA_ALLOWED_USER_IDS` is mandatory and must contain at least one Supabase
Auth user UUID. This keeps the initial Elara deployment owner-only even if
project-level signup configuration changes unexpectedly.

Mutation actor provenance is server-owned. Browser requests do not submit
`actor`; the authenticated operator API records `operator-ui`. Future
ChatGPT and embedded-AI adapters must receive separate authenticated server
entry points rather than impersonating the operator route.
