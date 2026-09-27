# AI Chat Runtime

The Chat subsystem provides a durable, owner-scoped conversation backend behind
Elara's own API. It does not own operational state, and it never grants a model
mutation authority.

```text
Browser
   |  authenticated HTTP + SSE
   v
Chat API (src/api/chat-api.ts)
   |
   +-- ChatKernel (src/domain/chat-kernel.ts)   durable turn authority
   |        |
   |        v
   |   PostgresChatStore (src/db/postgres/chat-store.ts)
   |        |
   |        v
   |   PostgreSQL chat_threads / chat_messages
   |
   +-- ChatTurnOrchestrator (src/ai/chat-turn.ts)
            |
            +-- ChatProvider (adapter, server-side)
            +-- MemoryProvider (optional context)
```

## Current deployment state

No provider adapter is configured yet. `GET /chat/models` reports every catalog
model as unavailable. A turn request for a catalog model with no configured
adapter is claimed durably, then records its assistant attempt as
`FAILED/PROVIDER_UNAVAILABLE` and returns `503 MODEL_UNAVAILABLE`; the failed
attempt remains replayable history rather than a pending generation. Every
manual Elara workflow is unaffected.

Migration `0006_ai_chat` is present in the repository and applied by the
PostgreSQL integration suite. It has **not** been applied to the live Supabase
database; Chat is not usable in the live environment until that migration is
applied and provider adapters are configured.

## Routes

All routes require a verified Supabase access token and are scoped by the
verified `AuthIdentity.userId`.

| Route | Result |
| --- | --- |
| `GET /chat/models` | `{ models: [{ modelId, providerId, available }] }` |
| `POST /chat/threads` | `201` created, `200` idempotent replay, `409` intent mismatch |
| `GET /chat/threads?limit=` | `{ threads: [...] }`, most recently updated first |
| `GET /chat/threads/:threadId` | `{ thread, messages }` — authoritative history |
| `POST /chat/threads/:threadId/turns` | `text/event-stream` turn events |

`POST /chat/threads/:threadId/turns` body:

```json
{
  "turnId": "client-generated uuid",
  "modelId": "gpt-6-luna",
  "message": "Where is the regulator?",
  "expectedRevision": 1
}
```

`threadId` comes from the path and the owner comes from verified auth. Both
request schemas are strict, so a browser that sends an `ownerId`, a
`providerId`, or any other unknown property receives `400 INVALID_REQUEST`
instead of a silently ignored field.

## Turn lifecycle

1. The model id is resolved against Elara's catalog. An unknown model is
   `503 MODEL_UNAVAILABLE`.
2. The turn is claimed in one transaction: the user Message, the pending
   assistant Message with its generation id and provider/model provenance, and
   the single Thread revision advance either all commit or none do.
3. A stale `expectedRevision`, a duplicate turn id with different intent, or a
   turn that is still in flight is `409 CONFLICT`. Nothing is written.
4. Optional memory recall runs under the same owner scope. A memory failure
   produces an empty context and never fails the turn.
5. The provider streams. Deltas are forwarded to the client as they arrive.
6. The assistant Message is finalized exactly once as completed or failed.
7. A client disconnect aborts the provider and finalizes the attempt as
   cancelled.

The stream ends after one terminal event: `message.completed` or
`message.failed`. A retried turn id that is already durable replays the stored
terminal state with `replay: true` and no deltas — a client that never
received the final event gets the authoritative stored answer back.

### Failure codes

Only these codes cross the API boundary or reach storage:

`PROVIDER_UNAVAILABLE`, `PROVIDER_FAILED`, `PROVIDER_TIMEOUT`,
`PROVIDER_OUTPUT_TOO_LARGE`, `EMPTY_RESPONSE`, `GENERATION_CANCELLED`.

Provider error text, HTTP status detail, prompts and credentials are discarded
server-side. A failed attempt keeps its user Message and an assistant row with
empty content, so conversation history is never rewritten; a retry is a new
turn with a new generation id.

### If a stream ends without a terminal event

A durable finalization fault (for example a database outage) cannot produce a
`message.failed` event, because no failed attempt was recorded. The stream
simply ends. The correct client response is to re-read the Thread with
`GET /chat/threads/:threadId`, which remains authoritative.

## Security properties

- Owner identity is derived only from the verified `AuthIdentity`. A thread
  owned by another identity is reported as not found, never as forbidden.
- The browser never receives database credentials, SQL, or provider SDK
  identity, and never talks to a provider or to the memory provider.
- Row-level security stays enabled on `chat_threads` and `chat_messages`, and
  the `anon` / `authenticated` roles retain no privileges on them.
- Chat holds no operational mutation authority. Questions about current Jobs,
  Tasks, Repairs or Scheduled Actions must be answered from Elara's live typed
  reads.

## References

- Architecture: `documents/architecture/AI_Chat_Architecture.md`
- Contracts: `src/contracts/chat.ts`
- Provider port: `src/ai/chat-provider.ts`
- Turn orchestration: `src/ai/chat-turn.ts`
- Durable authority: `src/domain/chat-kernel.ts`
- Repository: `src/db/postgres/chat-store.ts`
- Tests: `src/domain/chat-kernel.test.ts`, `src/ai/chat-turn.test.ts`,
  `src/api/chat-api.test.ts`, `src/db/postgres/chat-store.test.ts`,
  `integration/chat-postgres.test.ts`
