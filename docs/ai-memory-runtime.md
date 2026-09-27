# AI Memory Runtime

The memory subsystem provides durable AI memory behind the provider-neutral
`MemoryProvider` port. It does not own operational state; it derives context
from it.

## Configuration

Memory is **optional infrastructure**. The application runs correctly with
no memory provider configured.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELARA_MEMORY_PROVIDER` | No | `none` | Provider selection: `none` or `hindsight` |
| `ELARA_HINDSIGHT_URL` | When provider is `hindsight` | — | Hindsight HTTPS origin (HTTP permitted only on loopback) |
| `ELARA_HINDSIGHT_API_KEY` | When provider is `hindsight` | — | Hindsight API bearer token |
| `ELARA_MEMORY_REQUEST_TIMEOUT_MS` | No | `5000` | Per-request timeout (max 30000) |

All variables are server-side only. No memory credentials appear in browser
bundles, client configuration, or Vite environment variables.

### Provider resolution

```text
ELARA_MEMORY_PROVIDER=none      → NullMemoryProvider  (no-op, deterministic)
ELARA_MEMORY_PROVIDER=hindsight → HindsightMemoryProvider (narrow HTTP adapter)
ELARA_MEMORY_PROVIDER absent    → NullMemoryProvider
```

When Hindsight is explicitly selected but the configuration is invalid
(missing URL/API key, malformed URL), the application **fails closed** at
startup rather than silently falling back to the null provider.

## Architecture

```text
AI orchestration
        |
        v
  MemoryProvider (interface)
        |
        +-- NullMemoryProvider    (no-op, tests, degraded mode)
        |
        +-- HindsightMemoryProvider (narrow HTTP adapter)
                |
                +-- secret-screen.ts (pre-retention credential screening)
                |
                v
           Hindsight API (server-side only)
```

The browser never communicates with Hindsight directly. Models never receive
Hindsight credentials.

### Bank isolation

Future orchestration must derive `MemoryScope.ownerId` from the verified
`AuthIdentity.userId` server-side. There is no browser/model memory route in
this pass. The caller supplies an `ownerId` in every `MemoryScope`. The adapter
deterministically derives a Hindsight bank identifier from that value using
SHA-256. Callers cannot choose or inject arbitrary bank IDs.

### Secret screening

Every piece of content passes through a provider-independent credential
screening layer before retention. High-confidence secrets (AI API keys,
GitHub tokens, cloud credentials, private keys, JWTs, database URLs with
passwords) are blocked. Detected secrets never appear in logs, error messages,
thrown exceptions, or memory provider requests.

### Provenance

Retained items carry Elara source metadata (source kind, source ID,
occurrence time, related entity identifiers) as Hindsight metadata. Recalled
items extract provenance from that metadata so the AI layer can answer
"Why does Elara remember this?" without trusting generated prose.

### Stable document identity

The `documentId` from `MemoryWrite` is passed directly to Hindsight with
`update_mode: replace`. Repeated
retention of the same logical source updates the same document rather than
creating uncontrolled duplicates.

### Failure semantics

- A Hindsight outage does not make Elara's ordinary operational application
  unavailable.
- Raw adapter failures are sanitized typed faults. The server-assembled
  optional provider reports only safe failure codes, then returns normally on
  retain failure and an empty result on recall failure. Memory projection must
  remain after the domain commit when introduced in a later pass.
- Secret matches block retention before HTTP and are reported only by category.
- Requests and response streams are aborted after `ELARA_MEMORY_REQUEST_TIMEOUT_MS`;
  response bodies are also bounded to 2 MB.
- Provider HTTP errors do not echo the response body, which could contain
  private content.

## Client strategy

The official `@vectorize-io/hindsight-client` TypeScript package is not used.
Instead, a narrow HTTP adapter using native `fetch` (Node 24) implements only
the two operations Elara needs (`retain` and `recall`). This:

- Keeps the dependency graph clean (no transitive AI orchestration
  dependencies)
- Avoids coupling to the Vercel AI SDK
- Matches the existing Elara adapter pattern (see `pg` adapter,
  `SupabaseAuthVerifier`)
- Remains auditable and replaceable

## References

- Architecture: `documents/architecture/AI_Memory_Architecture.md`
- Contract: `src/ai/memory-provider.ts`
- Adapter: `src/ai/hindsight-adapter.ts`
- Secret screening: `src/ai/secret-screen.ts`
- Config: `src/runtime/node/memory-config.ts`
- Hindsight upstream: `vectorize-io/hindsight` @ `ccfe85b` (2026-09-26)