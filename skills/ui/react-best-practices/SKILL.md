---
name: "elara-react-best-practices"
description: "Apply focused React performance and rendering practices to Elara Relay's React 19 + Vite client. Use for async waterfalls, bundle loading, repeated browser listeners/storage work, re-render problems, long lists, and measured client-side performance issues."
---

# Elara Relay — React Best Practices

Improve Elara's React client without importing Next.js or server-component
assumptions into the codebase.

Elara currently uses:

- React 19.3
- Vite 8.3
- Hono API/server boundary
- TypeScript 6 + native TypeScript 7 gates

This skill is intentionally much smaller than the upstream Vercel React/Next.js
guide.

## Apply when

Use for:

- measured React render problems
- avoidable client async waterfalls
- bundle/code-splitting work
- repeated global listeners
- browser storage hot paths
- long operational lists
- non-urgent expensive UI updates

Do not load this skill for ordinary UI styling.

## Measure before optimizing

First identify the actual cost.

Useful evidence includes:

- React DevTools
- browser performance tools
- Vite bundle output
- targeted Playwright behavior/timing

Do not make clear code more complex for speculative micro-optimization.

## Load only the relevant rule

### Async

- `rules/async-parallel.md`
- `rules/async-defer-await.md`

### Bundle

- `rules/bundle-barrel-imports.md`
- `rules/bundle-dynamic-imports.md`
- `rules/bundle-conditional.md`

### Browser state

- `rules/client-event-listeners.md`
- `rules/client-localstorage-schema.md`

### Re-render behavior

- `rules/rerender-derived-state-no-effect.md`
- `rules/rerender-move-effect-to-event.md`
- `rules/rerender-no-inline-components.md`
- `rules/rerender-lazy-state-init.md`
- `rules/rerender-functional-setstate.md`
- `rules/rerender-transitions.md`
- `rules/rerender-use-deferred-value.md`

### Rendering

- `rules/rendering-content-visibility.md`
- `rules/rendering-conditional-render.md`

### Data hot paths

- `rules/js-index-maps.md`
- `rules/js-set-map-lookups.md`

Do not load the entire rules directory automatically.

## Deliberately excluded upstream guidance

This Elara adaptation omits rules that assume:

- Next.js Server Components
- Next.js Server Actions
- Next.js `dynamic()`
- RSC serialization
- Vercel `after()`
- SWR as a required data layer
- SSR hydration as an existing Elara concern

It also omits low-value micro-optimizations that should only be considered after
profiling.

If Elara's architecture changes, revisit current upstream/official sources then.

## Architecture boundary

Performance work must not weaken:

- mutation safety
- auth
- domain validation
- accessible interaction
- visible pending/failure state
- manual non-AI workflows

A faster incorrect state is still incorrect.

## Completion

A performance refactor is complete when:

- the targeted cost is reduced or the reasoning is concrete
- behavior remains correct
- accessibility remains intact
- TypeScript 6 and 7 pass
- relevant tests pass
- complexity did not increase without measurable benefit

---

Adapted for Elara Relay from Vercel Labs' MIT-licensed
`react-best-practices` skill.
