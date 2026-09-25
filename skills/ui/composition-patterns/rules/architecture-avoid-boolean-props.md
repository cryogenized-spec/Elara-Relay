---
title: "Avoid Boolean Prop Proliferation"
impact: "high"
---

# Avoid Boolean Prop Proliferation

Do not turn one Elara component into many hidden modes through accumulating
boolean props.

Bad direction:

```tsx
<WorkRow
  compact
  isRepair
  isWaiting
  isOverdue
  showCustomer
  showFollowUp
  showHistory
/>
```

Each flag increases the number of possible combinations, including combinations
that do not make product sense.

## Prefer explicit composition

When variants genuinely differ in structure or behavior, make that difference
visible in the component tree.

Prefer:

```tsx
<RepairRow repair={repair} />
<TaskRow task={task} />
```

over a universal row with many mode switches.

Shared internals can still be extracted:

```tsx
<OperationalRow>
  <OperationalRow.Identity />
  <OperationalRow.Status />
  <OperationalRow.Meta />
</OperationalRow>
```

## Boolean props are not forbidden

A boolean is appropriate when it represents one simple independent fact.

Examples:

- `disabled`
- `expanded`
- `selected`

The smell is a growing set of booleans that collectively choose component
identity, layout, workflow, or mutually exclusive modes.

## Elara rule

Do not use prop flags to visually collapse distinct domain concepts.

A Job, Task, Repair, and Scheduled Action should not become one mega-component
whose identity is selected by booleans.

Prefer explicit domain-facing variants with shared presentation primitives.

## Review trigger

Refactor when:

- several props are mutually exclusive
- combinations are impossible or nonsensical
- JSX contains long mode-dependent branches
- callers need product knowledge to choose a valid flag combination
- adding one feature requires another boolean

The goal is not fewer props at all costs.

The goal is an API whose valid states are obvious.
