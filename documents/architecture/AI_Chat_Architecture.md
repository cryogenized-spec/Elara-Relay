# Elara Relay — AI Chat Architecture

**Status:** Implementation contract  
**Phase:** Pass 1I — AI Chat Foundation  
**Updated:** 2026-09-27

## 1. Purpose

Add one durable Elara Chat surface over the operational system.

Chat is an Elara-owned feature that can use replaceable model providers. It must
not move operational truth, credentials, or mutation authority into the browser
or a model provider.

The invariant is:

> Elara owns the conversation record and operational truth. Providers generate
> candidate responses.

## 2. Pass 1I target

The completed foundation should provide:

- one mobile-first Chat surface in the Elara application
- durable, owner-scoped Threads and Messages in PostgreSQL
- a server-authenticated API for listing, reading, creating, and continuing
  Threads
- streaming assistant output with cancellation and durable completion state
- first-class model identities for `gpt-6-luna` and
  `muse-spark-1.3-contributor`
- a provider-neutral `ChatProvider` port and server-side provider adapters
- explicit provider/model provenance for every assistant generation
- optional memory recall through `MemoryProvider`, with provenance preserved
- no model access to raw PostgreSQL or direct domain mutation

## 3. Provider and model identity

A model identity contains both:

```text
providerId
modelId
```

They are separate values. The adapter is selected by `providerId`; Elara's
stable model identity is `modelId`. Provider SDK identifiers remain inside
the adapter.

The initial Elara catalog is:

| Elara model ID | Provider adapter ID |
| --- | --- |
| `gpt-6-luna` | `openai` |
| `muse-spark-1.3-contributor` | `muse` |

The server owns this catalog. The browser may request a catalog model ID, but
the server validates it against the catalog and routes it to the matching
configured adapter. The browser cannot submit an arbitrary provider URL, SDK
model string, credential, or adapter identity.

`src/ai/chat-provider.ts` establishes this provider-neutral contract and
catalog. A missing adapter or unknown model fails closed with a safe
availability error.

## 4. Durable conversation model

Use Elara PostgreSQL, not provider conversation storage, as the source of
record.

### Thread

A Thread has:

- stable UUID
- trusted `ownerId` from verified `AuthIdentity`
- optional title
- created and updated timestamps
- monotonically increasing revision

### Message

A Message has:

- stable UUID and owning Thread
- role: `user` or `assistant`
- content
- created timestamp
- state: `pending`, `completed`, or `failed`
- assistant provenance when role is `assistant`: generation ID, provider ID,
  model ID, completion time, and token usage when available

User Messages are complete on insertion and have no model provenance.
Assistant Messages begin pending before provider generation. On normal
completion, the final assembled content and usage are committed with completed
state. Provider errors or client cancellation close the generation as failed;
incomplete text must not be presented later as a completed assistant answer.

A Thread and every Message must carry a database-enforced owner relationship.
The API always scopes queries by the verified owner. A caller-supplied owner ID
is never trusted. RLS stays enabled and browser roles retain no direct table
privileges.

Messages are append-only after completion. A failed generation is retained as
a failed attempt for diagnosis and retry history; retry creates a new assistant
Message with new provenance.

## 5. Turn lifecycle

The server performs a turn in this order:

1. Authenticate the request and derive `ownerId`.
2. Validate the Thread belongs to that owner and check the expected revision.
3. Validate the requested model against Elara's model catalog.
4. Persist the user Message and a pending assistant Message in a transaction.
5. Resolve optional memory context under the same owner boundary. Memory
   failure produces an empty context and does not fail Chat.
6. Ask the selected provider adapter to stream the generation.
7. Stream text deltas to the authenticated client.
8. Persist the completed assistant Message, provenance, usage, and new Thread
   revision.
9. On provider failure, disconnect, or cancellation, mark the assistant attempt
   failed and release generation resources.

Only one active generation may advance a given Thread revision at a time.
Concurrent requests with a stale revision receive a conflict response. A stable
client turn ID makes retries idempotent and prevents duplicate user Messages.

The durable completion is authoritative: if the network disconnects after the
provider finishes but before the client receives the final event, reopening the
Thread returns the stored completed Message.

## 6. Streaming transport

Use authenticated HTTP with server-sent events (SSE) for text streaming. The
initial POST creates and runs one turn. Events are typed and contain no provider
SDK objects:

- `message.started`: Elara Message and generation IDs
- `message.delta`: text delta
- `message.completed`: Message ID, provenance, and usage
- `message.failed`: safe Elara error code and Message ID

The stream ends after one terminal event. Client disconnect propagates an
`AbortSignal` to the provider. The server still records whether the generation
completed or failed. Provider error messages, request headers, credentials,
stack traces, and raw prompts are not sent to the browser.

## 7. Provider adapter boundary

A `ChatProvider` adapter:

- runs only on the server
- receives an Elara model identity and normalized messages
- yields text deltas and a terminal completion event
- receives cancellation through `AbortSignal`
- returns usage when the provider supports it
- maps provider errors to safe Elara error codes
- does not know Thread persistence, owner authorization, or domain storage

API keys are loaded from the deployment's server-side secret store. They are
never written to PostgreSQL, sent to the browser, included in prompts, or
stored in logs. Missing configuration disables that adapter without breaking
manual Elara operations or other configured providers.

## 8. Memory and operational context

Memory is optional context. The chat orchestrator may call
`MemoryProvider.recall` with a server-derived owner scope. Any recalled text
keeps its evidence provenance through prompt assembly and is clearly treated as
context, not operational truth.

Questions about current Jobs, Tasks, Repairs, or Scheduled Actions must use
Elara's live typed read APIs. Memory may explain historical context but cannot
answer current-state questions authoritatively.

Chat does not directly mutate operational state in the first foundation slice.
A future tool-calling slice must use typed, authenticated Elara operations,
existing domain validation, idempotency, revision checks, and explicit approval
for external actions.

## 9. Initial scope boundary

Pass 1I does not add:

- a provider-owned conversation database
- browser-side API keys or provider SDKs
- arbitrary model/provider configuration from clients
- direct SQL or mutation tools for models
- automatic Event or conversation memory ingestion
- unaudited external actions
- hidden provider-specific reasoning or memory APIs

The current increment provides the provider-neutral streaming contract and
model catalog. Persistence, authenticated Chat endpoints, concrete provider
adapters, and the Chat UI remain implementation slices to build against this
contract.

## 10. Delivery sequence

1. Provider-neutral model and streaming contract
2. PostgreSQL Thread/Message migration and repository with owner isolation
3. Authenticated thread and turn API with cancellation and durable finalization
4. Server-side OpenAI and Muse adapters with secret-safe error mapping
5. Mobile-first Chat UI with model selection and reconnect/history behavior
6. Memory recall integration with evidence provenance
7. Adversarial review: cross-owner reads, concurrent turns, duplicate client
   turn IDs, disconnect races, provider outages, secret leakage, and
   provider/model mismatch

Each slice keeps Elara useful when providers are unavailable.
