---
title: "Create Explicit Component Variants"
impact: "medium"
---

# Create Explicit Component Variants

When component variants differ meaningfully in structure or behavior, prefer
explicit variants over hidden mode flags.

Prefer:

```tsx
<RepairAttentionRow repair={repair} />
<TaskAttentionRow task={task} />
```

over:

```tsx
<AttentionRow
  isRepair
  isTask={false}
  showRepairStage
  showDueDate={false}
/>
```

## Share internals, not ambiguity

Explicit variants may reuse shared primitives.

Example:

```tsx
function RepairAttentionRow({ repair }: Props) {
  return (
    <AttentionRow>
      <AttentionRow.Identity />
      <RepairStage />
      <RepairFollowUp />
    </AttentionRow>
  )
}
```

The variant name should make the product meaning obvious.

## Good variant boundaries

Use explicit variants when differences include:

- different domain concepts
- different action sets
- different required state
- different validation
- materially different structure

Do not create a new variant for a trivial visual difference that can be expressed
through one small style prop.

## Elara rule

Variants must not invent domain states.

A visual variant may represent an existing Repair stage or Task status, but it
must not create a lifecycle that exists only in React.

## TypeScript

Prefer types that make impossible combinations difficult or impossible to
express.

The caller should not need to remember which flags conflict.

## Completion

A good variant API lets a reviewer understand what is being rendered from the
component name and required props without reconstructing hidden conditional
logic.
