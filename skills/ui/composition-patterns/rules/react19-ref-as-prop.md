---
title: "Use React 19 Ref-as-Prop for New Function Components"
impact: "medium"
---

# Use React 19 Ref-as-Prop for New Function Components

Elara uses React 19.3.

For new function components that genuinely need to receive a ref, prefer React
19's ref-as-prop model.

Example:

```tsx
type InputProps = {
  ref?: React.Ref<HTMLInputElement>
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
}

function TextInput({ ref, ...props }: InputProps) {
  return <input ref={ref} {...props} />
}
```

Do not introduce `forwardRef` by habit in new React 19 code.

## Existing code

Do not churn existing working `forwardRef` components merely to modernize
syntax unless the refactor has a concrete benefit.

Preserve behavior and test coverage.

## Refs are escape hatches

Use refs for imperative behavior such as:

- focus
- selection
- scrolling
- measurement
- integration with non-React APIs

Do not use refs to move ordinary application state between components.

Prefer props, context, or lifted state for declarative data flow.

## Context

React 19 also supports reading Context with `use(Context)`.

That does not make `useContext(Context)` invalid.

Use the form that makes the component clearest.

`use()` may be useful when conditional Context reads genuinely simplify the
component.

Do not replace ordinary `useContext` calls solely for fashion or churn.

## Imperative handles

Use `useImperativeHandle` sparingly.

Expose the smallest imperative surface required by the parent.

Prefer declarative props when the behavior can be expressed declaratively.

## Type compatibility

Keep ref types compatible with Elara's TypeScript 6 and native TypeScript 7
gates.

Do not silence ref typing with `any`.

## Completion

A ref API is good when:

- the imperative need is real
- the exposed ref surface is minimal
- new React 19 code does not require unnecessary `forwardRef`
- ordinary state is not smuggled through refs
- TypeScript and interaction behavior remain valid
