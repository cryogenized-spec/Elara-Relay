# Elara Relay — AI Memory Architecture

**Status:** Architectural contract  
**Phase:** Intelligence foundation  
**Research basis:** `vectorize-io/hindsight`, inspected 2026-09-27

## 1. Purpose

Elara needs durable AI memory without making an AI system the owner of
operational truth.

The memory subsystem exists to help an AI operator recover useful historical
context, patterns, preferences, decisions, relationships, and prior
conversations.

It does not replace Elara's domain model, PostgreSQL state, Events, or
Operations API.

The governing principle is:

> Elara owns truth. Memory derives context from truth.

## 2. Authority order

When multiple sources disagree, Elara uses the following authority order:

1. Current Elara domain state
2. Append-only Elara Event history
3. Provenance-backed recalled memory
4. Consolidated observations or standing context
5. Model inference

A lower layer must never silently override a higher layer.

Examples:

- A recalled memory saying a Repair is still `Testing` must not override a
  current Repair row saying it is `Ready`.
- A standing summary saying a Task remains outstanding must not override the
  durable Task row when that Task is `Done`.
- An inferred user preference must not be treated as stronger than an explicit,
  newer statement preserved in source history.

## 3. Architectural position

Memory is a server-side adapter behind an Elara-owned port.

The intended topology is:

```text
UI / ChatGPT / embedded AI
            |
            v
     Elara AI orchestration
            |
       +----+-------------------+
       |                        |
       v                        v
Operations API            MemoryProvider
       |                        |
       v                        v
Domain Kernel          provider adapter
       |                        |
       v                        v
PostgreSQL              Hindsight / future
```

The `MemoryProvider` is not part of the Domain Store.

It does not receive direct mutation authority over Jobs, Tasks, Repairs,
Parties, Scheduled Actions, Mutation Receipts, or Events.

The browser never talks directly to the memory provider.

Models never receive memory-provider credentials.

## 4. Core contract

The base memory boundary deliberately exposes only two operations:

- `retain`
- `recall`

`retain` stores derived contextual material.

`recall` returns relevant material ordered for use by Elara's AI orchestration.

Reasoning is deliberately absent from the base contract.

A provider-specific operation such as Hindsight `reflect` may be investigated
later as an optional capability, but it must not become a hidden second AI
orchestration authority.

Elara remains responsible for:

- model selection
- prompts
- tool policy
- typed intent generation
- Operations API invocation
- approval boundaries
- final response construction

## 5. Operational truth versus memory

Good memory candidates include:

- conversations
- user preferences
- architectural decisions
- workshop patterns
- recurring failure modes
- historical customer context
- supplier context
- explanations surrounding domain Events
- useful relationships not represented directly by the schema
- durable lessons derived from repeated evidence

Poor memory candidates include current answers that already have an
authoritative domain representation.

Examples of questions that must read live Elara state instead of memory:

- What Tasks are due today?
- What stage is this Repair in?
- Has this Job been completed?
- What Reminder is scheduled next?
- What is the current revision of this Task?

Memory may provide historical context for those questions, but not the current
answer.

## 6. Identity and isolation

Memory scope is assigned by trusted server code.

The browser and model do not choose provider bank IDs, namespaces, tenant IDs,
or equivalent isolation identifiers.

The Elara-facing contract uses an `ownerId`.

A provider adapter derives its provider-specific isolation key from that trusted
value.

For Hindsight, this means the adapter may map:

```text
ownerId -> bank_id
```

but `bank_id` does not become part of Elara's public AI contract.

Tags provide narrower retrieval scopes inside the trusted owner boundary.

Expected tag families include:

```text
job:<id>
task:<id>
repair:<id>
party:<id>
scheduled-action:<id>
session:<id>
topic:<name>
source:<kind>
```

Tags improve retrieval and scoping.

They are not authorization.

Authorization has already happened before the memory adapter is invoked.

## 7. Provenance

Every retained item must have a stable source reference.

A source reference identifies where Elara obtained the information.

Supported initial source kinds are:

- `conversation`
- `domain-event`
- `document`
- `note`

Where applicable, provenance may additionally identify related Elara entities:

- Party
- Job
- Task
- Repair
- Scheduled Action

Memory returned to the AI layer retains provenance.

Derived observations should retain evidence references whenever the provider
supports them.

This makes it possible to answer:

> Why does Elara remember this?

without treating generated memory prose as self-authenticating truth.

## 8. Stable document identity

Each retained logical source receives a stable `documentId`.

Repeated ingestion of the same logical source must update or replace that
provider-side document rather than creating uncontrolled duplicates.

Examples:

```text
conversation:<session-id>
event:<event-id>
document:<document-id>
note:<note-id>
```

Provider adapters are responsible for enforcing these semantics even when the
underlying provider represents document replacement differently.

Random document identifiers must not be generated for every re-ingestion of the
same logical source.

## 9. Temporal memory

Memory distinguishes between:

- when something happened
- when Elara learned it

Where source data contains a meaningful occurrence time, retain it.

Recall requests may also include a query timestamp so expressions such as:

- yesterday
- last week
- before the repair
- earlier this month

can be resolved against a deliberate clock rather than an uncontrolled provider
default.

Operational state still comes from the domain model.

Temporal memory exists for historical context.

## 10. Retrieval strategy

Elara's contract does not require a specific retrieval implementation.

A capable provider may combine:

- semantic/vector retrieval
- lexical or BM25 retrieval
- temporal retrieval
- graph or relationship retrieval
- reranking

The Hindsight implementation inspected on 2026-09-27 uses all four retrieval
families and combines ranked candidates using Reciprocal Rank Fusion before
reranking.

That is a useful reference architecture for future native Elara retrieval.

Elara should not compare provider-specific raw retrieval scores across
providers.

The base contract therefore relies on provider-returned ranking order rather
than exposing a normalized universal score.

## 11. Deterministic relationships before inferred relationships

Elara already possesses authoritative relationships.

Examples:

```text
Party -> Job
Job -> Task
Job -> Repair
Repair -> Event
Scheduled Action -> execution history
```

AI memory must not replace these relationships with inferred equivalents.

When retrieval needs related operational context, deterministic Elara
relationships should be resolved first.

Inferred graph relationships are useful only for softer connections that do not
already exist in the domain model.

Examples include:

- two conversations discussing the same failure pattern
- supplier discussions related by product family
- recurring customer preferences
- similar repair diagnoses across unrelated Jobs

## 12. Observations

Providers may derive observations from multiple memories.

An observation is useful when it represents a durable pattern rather than a
single raw statement.

Examples:

```text
"This supplier commonly requires follow-up before confirming stock."

"This model repeatedly develops the same safety-lever fault."

"The operator prefers compact operational interfaces."
```

Observations should be:

- evidence-backed
- provenance-aware
- revisable
- sensitive to contradictory newer evidence
- subordinate to current domain state

Observations must not be treated as immutable facts.

If the provider exposes evidence or proof counts, Elara should preserve them
through the adapter.

## 13. Standing context

Some expensive recurring questions may eventually be represented as
precomputed standing context.

Examples:

- What are the operator's durable interface preferences?
- What recurring workshop failure patterns have emerged?
- What architectural conventions govern Elara?
- What supplier behaviour has been repeatedly observed?

Hindsight calls this concept a mental model.

Elara treats it generically as `standing-context`.

Standing context is derived knowledge.

It never outranks live operational state or source Events.

A stale standing-context item should cause deeper retrieval rather than being
trusted as current truth.

## 14. Secret and sensitive-data boundary

Long-term memory creates a new persistence boundary.

Content must therefore be screened before provider retention.

At minimum the memory path should reject or redact high-confidence secrets such
as:

- AI provider API keys
- GitHub tokens
- cloud credentials
- private keys
- database URLs containing credentials
- bearer tokens and JWTs
- payment-provider secrets

Provider logs and traces must not contain the raw matched secret.

Hindsight's Memory Defense implementation is a useful reference for this
boundary, but Elara must not depend on one provider for the existence of the
policy.

Secret filtering belongs on the Elara side of the adapter boundary or in a
provider-independent server component.

## 15. Failure behaviour

Memory is optional infrastructure.

Failure of memory retain must not roll back an already successful authoritative
Elara domain mutation.

Failure of memory recall must not make ordinary Elara operations unavailable.

The AI orchestration layer must be able to continue with:

```text
memory unavailable
```

and an empty memory result.

The `NullMemoryProvider` exists as the explicit no-memory implementation.

This supports:

- deterministic tests
- development without a memory backend
- provider outages
- future provider replacement
- Elara's requirement to remain useful without AI

## 16. Event ingestion

Domain Events are a natural source for memory because they already describe
meaningful changes and preserve history.

The initial event-memory pattern should be:

```text
successful domain transaction
        |
        v
authoritative Event committed
        |
        v
memory ingestion requested
        |
        v
MemoryProvider.retain(...)
```

Memory retention occurs after authoritative commit.

It is not part of the transaction that establishes operational truth.

A future durable outbox may be introduced if guaranteed asynchronous memory
projection becomes necessary.

Until then, memory projection must remain best-effort and observable.

## 17. Conversation ingestion

Conversation memory should retain the richest available source representation.

Do not pre-summarize a conversation merely to reduce storage.

Pre-summarization can erase:

- chronology
- speaker identity
- contradiction
- causal language
- exact terminology
- entity relationships

A stable session identifier should provide the `documentId`.

The provider may internally extract smaller facts or chunks.

That is an implementation concern behind the adapter.

## 18. Hindsight mapping

Hindsight is a compatible candidate implementation of the Elara memory port.

The initial conceptual mapping is:

```text
Elara retain() -> Hindsight retain
Elara recall() -> Hindsight recall
ownerId        -> server-derived Hindsight bank
scope.tags     -> Hindsight tags
documentId     -> Hindsight document_id
timestamp      -> Hindsight timestamp
source         -> Hindsight metadata
```

Hindsight `reflect` is deliberately not mapped into the base port.

Hindsight's provider-specific:

- observations
- mental models
- graph
- reranker
- MCP server
- knowledge pages

remain implementation details or optional future capabilities.

Elara code outside the adapter must not depend on them.

## 19. MCP boundary

Hindsight's built-in MCP endpoint must not become an alternate path to Elara
operational state.

The supported authority path remains:

```text
ChatGPT / AI
     |
     v
Elara server boundary
     |
     v
typed Elara operations
     |
     v
Domain Kernel
```

If Elara later exposes MCP, it should expose Elara-owned tools and Elara-owned
authentication.

A memory provider's MCP server is private infrastructure unless a separate
security review deliberately changes that policy.

## 20. Provider replacement

Application code must depend on `MemoryProvider`, not on a Hindsight client.

A replacement provider should require changing adapter/runtime assembly rather
than rewriting AI orchestration.

The contract intentionally avoids:

- provider bank identifiers
- provider model names
- embedding dimensions
- vector-store APIs
- reranker configuration
- provider-specific scores
- provider-specific reasoning endpoints

Those belong behind adapters.

## 21. Initial implementation boundary

The first implementation introduces:

```text
src/ai/memory-provider.ts
```

containing:

- provider-neutral memory types
- `MemoryProvider`
- `NullMemoryProvider`

It does not yet introduce:

- a Hindsight dependency
- embeddings
- migrations
- a second database
- an AI provider
- automatic domain Event projection
- browser memory APIs
- MCP exposure
- provider-specific configuration

This keeps the architectural boundary reviewable before infrastructure is
attached to it.

## 22. Future implementation sequence

A safe sequence is:

```text
1. Provider-neutral contract
2. Null provider and contract tests
3. AI orchestration boundary
4. Secret filtering
5. Hindsight adapter experiment
6. Recall integration
7. Conversation retention
8. Domain Event memory projection
9. Evidence/observation surfaces
10. Retrieval evaluation
```

A Hindsight adapter should begin as an experimental provider behind the stable
port.

Only measured retrieval quality and operational value should determine whether
it becomes the default deployment.

## 23. Evaluation

Memory quality must be tested independently from chat quality.

Useful evaluation cases include:

- exact name lookup
- paraphrased preference lookup
- historical date queries
- contradiction handling
- stale-memory versus live-state conflicts
- cross-Job contextual retrieval
- owner isolation
- tag isolation
- duplicate document re-ingestion
- secret rejection/redaction
- provider outage
- provenance preservation

A memory system that sounds convincing but retrieves the wrong source is a
failure.

## 24. Architectural invariant

The durable invariant is:

> Memory may help Elara understand its history. It may never become the place
> Elara decides what is currently true.

That keeps the intelligence layer useful, replaceable, auditable, and
subordinate to the operational system it serves.
