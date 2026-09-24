---
title: "Version and Minimize Browser Storage"
impact: "medium"
---

# Version and Minimize Browser Storage

Use browser storage only for small client-owned values that genuinely benefit
from surviving reloads.

Do not treat `localStorage` as durable Elara operational storage.

PostgreSQL remains the durable store for Jobs, Tasks, Repairs, Scheduled
Actions, Events, mutation receipts, and other operational truth.

## Store the minimum

Prefer small values such as:

- UI preferences
- dismissed local hints
- non-sensitive view preferences

Do not store complete domain objects merely because they are available.

## Never store secrets

Do not place in browser storage:

- database credentials
- service-role secrets
- private keys
- raw provider secrets
- sensitive auth material that the current auth architecture does not already
  require there

Do not cache unnecessary customer or operational data.

## Version keys

When a stored shape may evolve, version the key or schema.

Example:

```ts
const KEY = "elara:view-preferences:v1"
```

A future incompatible shape can then migrate or discard the older value
deliberately.

## Handle failure

Browser storage can be unavailable or fail because of:

- browser policy
- quota
- private mode
- storage restrictions

Read/write failures must not break core Elara workflows.

Manual operational flows should continue with sensible defaults.

## Validate stored data

Treat browser storage as untrusted input.

Parse and validate before use.

Do not assume a JSON value still matches today's TypeScript type.

## Completion

Browser storage use is acceptable when:

- the value is truly client-owned
- the stored shape is minimal
- schema evolution is deliberate
- failure is harmless
- no secret or unnecessary operational data is persisted
