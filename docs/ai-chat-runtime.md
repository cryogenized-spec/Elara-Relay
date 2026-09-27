# AI Chat Provider Runtime

The chat provider runtime implements the server-side concrete adapters behind
the provider-neutral `ChatProvider` port.

It owns provider protocol translation, provider credentials, cancellation,
timeouts and safe error mapping for model generation. It does not own Chat
persistence, owner authorization, the turn lifecycle, or the Chat UI:
Threads, Messages and assistant provenance remain Elara-owned PostgreSQL
concerns.

## Configuration

Chat generation is **optional infrastructure**. With no provider configured,
manual Elara operations continue normally and chat turns report the model as
unavailable.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELARA_OPENAI_API_KEY` | No | — | Enables the `openai` provider. Absent/blank disables only this provider. |
| `ELARA_OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Reviewed provider origin and API prefix (HTTPS; HTTP only on loopback). |
| `ELARA_MUSE_API_KEY` | No | — | Enables the `muse` provider (Meta Model API). Absent/blank disables only this provider. |
| `ELARA_MUSE_BASE_URL` | No | `https://api.meta.ai/v1` | Reviewed provider origin and API prefix (HTTPS; HTTP only on loopback). |
| `ELARA_CHAT_REQUEST_TIMEOUT_MS` | No | `120000` | Overall per-generation bound (positive integer, max `600000`). |

All variables are server-side only. No chat credential is read from, or
exposed to, browser configuration, Vite environment variables, PostgreSQL,
logs, prompts, or the Chat API response stream.

### Provider resolution

```text
ELARA_OPENAI_API_KEY present → OpenAiChatProvider   (OpenAI Responses API)
ELARA_OPENAI_API_KEY absent  → provider disabled; gpt-6-luna fails closed
ELARA_MUSE_API_KEY present   → MuseChatProvider     (Meta Model API)
ELARA_MUSE_API_KEY absent    → provider disabled; muse model fails closed
```

A provider is enabled by its key alone. A value that is present but malformed
(invalid URL, embedded credentials, query or fragment, non-loopback HTTP,
non-positive or unbounded timeout, newline in a key) fails closed at startup
instead of silently degrading to a different endpoint.

`resolveChatProviders` builds only the configured adapters. Model resolution
still passes through `resolveChatProvider`, so an unknown model, or a model
whose provider is not configured, raises `ChatModelUnavailableError` without
touching the network.

## Architecture

```text
Chat orchestration (turn lifecycle, SSE transport, persistence)
        |
        v
   ChatProvider (provider-neutral port)
        |
        +-- OpenAiChatProvider   (openai)  → POST {ELARA_OPENAI_BASE_URL}/responses
        |
        +-- MuseChatProvider     (muse)    → POST {ELARA_MUSE_BASE_URL}/chat/completions
                |
                +-- chat-http.ts (narrow native-fetch SSE transport)
                        |
                        v
                Provider HTTP API (server-side only)
```

Adapters yield normalized `ChatStreamEvent` values only:

- `text-delta` with the incremental assistant text
- exactly one terminal `completed` event, carrying token usage when the
  provider reports it

Provider SDK objects, provider model identifiers, request identifiers,
reasoning content, headers, URLs, status-line bodies and credentials never
cross the adapter boundary.

## Provider contracts

Provider protocols were reviewed from the published provider documentation
(see References) rather than assumed from Elara model display names.

### `openai` — `gpt-6-luna`

- **Endpoint:** `POST {base}/responses` with `stream: true`, the OpenAI
  Responses API, which OpenAI recommends for streaming because it emits typed
  semantic events.
- **Events consumed:** `response.output_text.delta` and `response.refusal.delta`
  (assistant text), `response.refusal.done` (final refusal text when no delta
  carried it), `response.completed` (usage), `response.incomplete` (incomplete
  reason), `response.failed` and `error` (terminal failure). Unknown event types
  are ignored so forward-compatible provider additions do not break a valid
  stream.
- **Refusals:** a provider refusal is model output, not silence. Refusal text is
  normalized into the same visible `text-delta` events as ordinary assistant
  text, without duplication, so a refused turn is never reported to the operator
  as an empty successful answer. A refusal is not a provider fault.
- **Termination:** only `response.completed` that carried at least one visible
  text delta completes a generation. An incomplete response maps to `INCOMPLETE`,
  or to `CONTENT_FILTERED` when the incomplete reason is `content_filter`.
  `response.failed` and `error` map to `PROVIDER_FAILURE`. A completed event with
  no assistant text fails closed rather than persisting empty content.
- **Usage:** `input_tokens` / `output_tokens` from `response.completed`.
- **Conversation ownership:** `store: false` is always sent, so Elara disables
  provider-managed Response application state and relies on Elara PostgreSQL as
  the source of record. This is not a statement about provider-level retention:
  the provider's own abuse-monitoring or account data-control policy may still
  retain request and response content. Operators remain responsible for the
  account-level data controls that match the sensitivity of the context Elara
  sends.
- **Parameters:** `max_output_tokens` is forwarded when the caller supplies a
  bound. `temperature` is deliberately not forwarded, because current OpenAI
  reasoning models reject the parameter.
- **Provider model identifier:** `gpt-6-luna` maps to the OpenAI model
  identifier `gpt-6-luna`, declared inside the adapter. Elara model identity
  never becomes a provider request field, and no provider identifier is
  accepted from a client.

### `muse` — `muse-spark-1.3-contributor`

- **Endpoint:** `POST {base}/chat/completions` with `stream: true`, the
  OpenAI-compatible Chat Completions surface Meta documents for incremental
  output and final-chunk usage.
- **Events consumed:** `choices[].delta.content` and `choices[].delta.refusal`
  chunks, the terminal `finish_reason`, the final `usage` chunk requested
  through `stream_options: {"include_usage": true}`, and the `[DONE]` sentinel.
  A top-level `error` chunk is a terminal provider failure. Refusal text is
  surfaced as visible assistant text, as with the OpenAI adapter.
- **Termination:** `finish_reason` is interpreted explicitly, because only
  `stop` is an ordinary completed answer:

  | `finish_reason` | Elara outcome |
  | --- | --- |
  | `stop` | completed generation |
  | `length` | `INCOMPLETE` — output limit reached, never a completed answer |
  | `content_filter` | `CONTENT_FILTERED` — deliberate content-policy outcome |
  | `tool_calls`, `function_call` | `UNSUPPORTED_TOOL_CALL` — this text-only slice does not execute tools |
  | any other value | `INVALID_RESPONSE` — fail closed |

  A usage chunk or `[DONE]` alone never completes a generation: the stream must
  have reported `stop`.
- **Roles:** Elara's provider-neutral `system` role maps to `developer`, which
  Meta documents as the preferred instruction role; `system` is only an
  OpenAI-compatibility alias there.
- **Parameters:** `max_completion_tokens` is forwarded when the caller supplies
  a bound (`max_output_tokens` is a Responses API field and is rejected on
  Chat Completions). `temperature` is forwarded when supplied.
- **Provider model identifier:** `muse-spark-1.3-contributor` maps to the Meta
  Model API identifier `muse-spark-1.3-contributor`, declared inside the
  adapter for the same reason as above.
- **Training terms (contributor tier):** the `-contributor` tier is deliberately
  cheaper because the operator grants the provider permission to use prompts and
  completions to train future models. The standard `muse-spark-1.3` identifier
  does not carry that permission. Elara's catalog identity
  `muse-spark-1.3-contributor` selects the contributor tier, so enabling this
  provider means operational, customer and supplier context sent through it may
  be used for provider training. Only configure this provider when that trade is
  acceptable for the content Elara will send. Moving to the standard tier is a
  catalog change (Elara model identity plus migration-constrained provenance and
  documentation), not a configuration toggle, and must be reviewed as such.

Both adapters fail closed on a stream that ends without a terminal completion:
partial text is never presented as a completed assistant answer.

## Provider data handling

Provider-side handling of conversation content is an account and model-tier
property, not something the adapter can guarantee. Two facts govern how Elara
should be configured:

- **OpenAI (`store: false`):** Elara disables Responses application-state
  storage, so OpenAI cannot return the generation through a stored response ID
  and Elara's PostgreSQL record remains the only conversation record. Provider
  abuse-monitoring retention and any other account-level data controls are still
  governed by the OpenAI account's policy, not by this flag.
- **Meta Model API (contributor tier):** the `muse-spark-1.3-contributor` tier
  grants the provider permission to use prompts and completions for future model
  training, which is why it is cheaper. The standard `muse-spark-1.3` tier does
  not carry that permission.

Consequences for operators:

- Treat a configured provider as an external data processor for whatever context
  the Chat orchestrator assembles, including recalled memory and operational
  context.
- Do not send content whose sensitivity exceeds the account's data-control
  posture, and prefer the standard Muse tier where training-permission terms are
  not acceptable.
- Chat prompts are not screened for secrets today. Memory retention screens for
  high-confidence credentials (`src/ai/secret-screen.ts`), but the chat path
  currently has no equivalent screen; that remains a follow-up slice.

## Cancellation, timeouts and bounds

- Client disconnects and server shutdown propagate through the caller's
  `AbortSignal`, which is combined with the request timeout signal and passed
  to `fetch`. Cancelling stops the upstream generation and releases the socket.
- `ELARA_CHAT_REQUEST_TIMEOUT_MS` bounds the whole request, including the
  streamed response. A stalled provider produces a `TIMEOUT` fault rather than
  hanging a turn forever.
- Caller cancellation is reported distinctly from a provider outage
  (`CANCELLED` versus `TIMEOUT`/`NETWORK`).
- Error response bodies are never parsed, logged or surfaced; they are drained
  only up to the fixed 4096-byte bound and then cancelled.
- A single provider event is capped at 512 KiB of characters. Provider output
  is streamed, never accumulated, so provider-controlled buffering is bounded
  even if a stream never ends.
- The response body is always cancelled when the consumer stops reading,
  including on cancellation, timeout and terminal events.

## Failure model

| Fault code | Meaning |
|------------|---------|
| `CANCELLED` | Caller aborted (client disconnect, server shutdown) |
| `TIMEOUT` | Overall request bound elapsed |
| `NETWORK` | Transport failure, refused connection or interrupted stream |
| `HTTP` | Provider returned a non-2xx status (status is retained, body is not) |
| `INVALID_RESPONSE` | Malformed, oversized, or unterminated provider stream; unrecognized termination reason; completed generation with no assistant text |
| `PROVIDER_FAILURE` | Provider reported a terminal failure |
| `INCOMPLETE` | Generation ended on an output limit and must not be committed as a completed answer |
| `CONTENT_FILTERED` | Provider content policy terminated the generation |
| `UNSUPPORTED_TOOL_CALL` | Provider requested tool execution, which this text-only slice does not perform |

`ChatProviderFault` carries only a code and an optional numeric status. It
never carries a provider message, body, header, URL, prompt or credential.
Unknown model/provider combinations raise `ChatModelUnavailableError` instead,
so orchestration can report safe model unavailability without a provider call.

## Testing

Adapter certification is deterministic and requires no live paid credential:

- mocked provider HTTP responses for each adapter (streaming, usage, HTTP
  errors, terminal failures, truncated streams, malformed events)
- termination-semantics regression tests: `length`, `content_filter`,
  `tool_calls`/`function_call` and unrecognized Muse finish reasons; OpenAI
  incomplete reasons, empty completed generations and refusal-only streams
- transport tests for SSE framing, event-size bounds, bounded error bodies,
  cancellation propagation and timeouts
- runtime configuration tests for provider enable/disable, endpoint validation
  and timeout validation
- browser-boundary assertions that chat provider secrets never reach browser
  runtime configuration

The adversarial foundation gate additionally mutates provider conversation
retention, unknown-model fail-closed behavior, output-limit termination,
unterminated-stream completion, refusal-text normalization, empty completed
generations, cancellation classification and the error-body read bound, and
requires the adapter tests above to reject each mutation.

## References

- Architecture: `documents/architecture/AI_Chat_Architecture.md`
- Contract and catalog: `src/ai/chat-provider.ts`
- Transport: `src/ai/chat-http.ts`
- OpenAI adapter: `src/ai/openai-chat-adapter.ts`
- Muse adapter: `src/ai/muse-chat-adapter.ts`
- Runtime configuration: `src/runtime/node/chat-config.ts`
- OpenAI streaming guide (Responses API, `response.output_text.delta`,
  `response.completed`), reviewed 2026-09-27
- Meta Model API Chat Completions documentation (`https://api.meta.ai/v1`,
  `developer` role precedence, `max_completion_tokens`, documented
  `finish_reason` values), reviewed 2026-09-27
- Meta Model API pricing/tier documentation (contributor tier training
  permission), reviewed 2026-09-27
