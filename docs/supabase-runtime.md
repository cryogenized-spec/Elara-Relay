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
