---
title: "Put User-Triggered Work in the Event Handler"
impact: "high"
---

# Put User-Triggered Work in the Event Handler

When work exists because the user performed a specific action, start that work
from the action handler rather than encoding the action as state and reacting to
it later in an effect.

Prefer:

```tsx
async function handleSave() {
  await saveTask(draft)
}
```

over:

```tsx
setShouldSave(true)

useEffect(() => {
  if (shouldSave) saveTask(draft)
}, [shouldSave, draft])
```

## Why this matters in Elara

Effect-driven user actions can accidentally repeat when unrelated dependencies
change.

That is especially dangerous around:

- durable mutations
- approval
- external actions
- scheduling
- retries

Elara already has mutation/replay protections, but the UI should not generate
duplicate intent unnecessarily.

## Effects still have a job

Use effects to synchronize the component with systems outside React when that
synchronization is caused by rendering/state rather than one explicit user
event.

Examples may include:

- subscribing to a browser event
- synchronizing an external widget
- updating document-level state

Do not eliminate effects blindly.

## Pending and errors

An event handler may update local presentation state for:

- pending
- success
- failure

while the actual durable mutation remains owned by the API/domain boundary.

Do not report success until the action confirms it.

## Completion

If a side effect answers "what did the user just do?", prefer the event handler.

If it answers "what external system must remain synchronized with this rendered
state?", an effect may be appropriate.
