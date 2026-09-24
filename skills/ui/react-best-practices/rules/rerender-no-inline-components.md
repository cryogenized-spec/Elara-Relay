---
title: "Do Not Define Stateful Components Inside Components"
impact: "high"
---

# Do Not Define Stateful Components Inside Components

Defining a React component inside another component creates a new component type
on every parent render.

That can cause React to remount the child, destroying local state and DOM
continuity.

## Symptoms

Watch for:

- input focus disappearing
- local state resetting
- effects repeatedly cleaning up and restarting
- animations restarting
- internal scroll position resetting

## Prefer top-level component definitions

Pass the required values as props.

Prefer:

```tsx
function RepairMeta({ repair }: { repair: Repair }) {
  return <div>{repair.serial ?? "No serial"}</div>
}

function RepairDetail({ repair }: Props) {
  return <RepairMeta repair={repair} />
}
```

over defining `RepairMeta` inside `RepairDetail`.

## Inline render expressions are different

This rule does not mean every piece of JSX must become a component.

Simple inline JSX is fine.

The problem is creating a new **component type** inside another component and
then rendering it as `<InnerComponent />`.

## Elara relevance

This matters especially in:

- forms
- Capture
- Repair editing
- Search result interactions

where accidental remounts can destroy focus or user-entered local state.

## Completion

Keep reusable or stateful component definitions stable across renders unless
there is a deliberate reason to remount them.
