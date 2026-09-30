# Security follow-ups

The 2026-09-27 adversarial review (findings F1–F16) is patched on this
branch except for the three items below. Each one needs a contract or
deployment-scope decision first, so they are tracked here instead of
half-fixed in code.

## F3 — Unbounded collection reads need pagination

Dashboard, Today, and Search return full collections in a single response.
That is fine for an owner-only pilot but becomes a latency and memory
problem as history grows, and it lets one slow read hold a worker.

Fixing it properly changes the API contract (cursor/limit parameters and
paged envelopes), so it waits for a pagination design rather than an ad-hoc
`LIMIT`. Until then, growth is bounded operationally by the single-owner
allowlist.

## Rate limiting (deployment scope)

Auth verification and the domain API have no rate limiter. Timeouts,
body caps, and statement timeouts bound the cost of one request, but they
do not bound the rate of requests from one client.

The right home for this is a deployment-scope decision: in-process token
buckets keyed by caller (needs trusted-proxy configuration for
`X-Forwarded-For`) versus gateway-level limiting at the host. Either way,
the auth boundary (`/auth/whoami` and every bearer-verified route, which
can trigger JWKS/user-info fetches) should be limited first.

## Security response headers (hosting scope)

The production Node transport now pins the two headers that belong to the
application rather than to a gateway: every non-preflight response carries
`Cache-Control: no-store` (authenticated operational payloads must not be
cached by an intermediary) and `X-Content-Type-Options: nosniff`. Preflight
responses are left untouched so `Access-Control-Max-Age` caching still works.
Hono serves no `X-Powered-By`, and the UI is a static client.

Still hosting scope, because they depend on TLS termination or edge policy:
`Strict-Transport-Security`, `Referrer-Policy`, and frame/CSP policy for the
UI. Those should be pinned once at the gateway (CDN/edge) rather than
scattered across app code, and that layer is chosen at deploy time.

## Rate limiting and proxy trust

The production transport does not read `X-Forwarded-*`, so no caller identity
or rate-limit key can be spoofed through a proxy header today. That also means
per-caller limiting still needs either trusted-proxy configuration or a
gateway-level limiter; see the rate-limiting item above.

## Already patched on this branch

Timestamps validate to 400 (F1), Postgres conflicts map to 409 (F2),
scheduler failures back off exponentially (F4), future-issued tokens and
plaintext issuers are rejected (F5, F9), auth fetches are timed out
(F10/F12/F14), statements are timed out (F6), idle pool failures cannot
crash the process (F7), corrupt rows never echo values (F8), request
bodies are capped (F15), and job creation retries random key collisions
(F16).
