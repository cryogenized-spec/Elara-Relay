---
title: "Prefer Children for Structural Composition"
impact: "medium"
---

# Prefer Children for Structural Composition

Use `children` when callers are arranging visible structure.

It keeps the component tree readable and makes the rendered hierarchy obvious.

Prefer:

```tsx
<RepairPanel>
  <RepairSummary />
  <RepairActions />
  <RepairTimeline />
</RepairPanel>
```

over several `renderHeader`, `renderActions`, and `renderFooter` props when
those callbacks merely insert static UI.

## Use render props when data flows outward

A render prop is appropriate when the parent owns data or state that must be
supplied to the rendered child.

Example:

```tsx
<ResultList
  items={results}
  renderItem={(result) => <SearchResult result={result} />}
/>
```

The callback has a real job: supplying `result`.

## Elara rule

Do not hide important screen structure inside callback props when composition
would show it directly in JSX.

This is especially useful for operational screens where a reviewer should be
able to see:

- summary
- status
- actions
- current fields
- linked work
- history

without mentally executing render callbacks.

## Avoid dogma

Children are not automatically better.

Use the simplest API that makes data flow and structure clear.

Do not introduce a compound component or context solely to eliminate one small
render prop.

## Accessibility

Structural composition must preserve:

- semantic order
- heading hierarchy
- form relationships
- focus order

A more elegant component API is not an excuse to reorder meaningful DOM
structure incorrectly.
