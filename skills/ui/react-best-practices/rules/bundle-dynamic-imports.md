---
title: "Lazy-Load Heavy Optional UI"
impact: "medium"
---

# Lazy-Load Heavy Optional UI

Use dynamic imports for large UI or dependencies that are not needed for the
initial Elara screen.

In React + Vite, prefer normal dynamic `import()` and `React.lazy` /
`Suspense` where they fit.

Example:

```tsx
const HeavyInspector = lazy(() => import("./HeavyInspector"))
```

## Good targets

Consider lazy loading for:

- large optional editors
- diagnostics/admin surfaces
- infrequently opened visualization tools
- substantial feature modules not needed on first paint

## Do not fragment tiny components

Every split adds request and loading-state complexity.

Do not lazy-load a small component merely because it lives below the fold.

## UX

A lazy boundary needs a fallback that preserves layout and does not create
misleading success/pending state.

Respect reduced motion if the fallback animates.

## Elara constraint

Do not lazy-load code required to understand the primary operational state if
the split makes Today, Work, Repairs, Schedule, or Search feel slower or less
reliable.

## Completion

Use a dynamic import when bundle evidence and usage frequency justify the split,
and verify the resulting loading behavior in the real UI.
