---
name: "elara-react-best-practices"
description: "Apply focused React performance and rendering practices to Elara Relay's React 19 + Vite client. Use for async waterfalls, bundle loading, event listeners, local browser storage, re-render behavior, transitions, long lists, and measured client-side performance work."
---

# Elara Relay — React Best Practices

Use this skill to improve Elara's React client without importing Next.js or
server-component assumptions into the codebase.

Elara currently uses:

- React 19.3
- Vite 8.3
- Hono API/server boundary
- TypeScript 6 + native TypeScript 7 gates

This skill is intentionally narrower than the upstream Vercel React/Next.js
guide.

## Apply when

Use for:

- React component performance
- avoidable async waterfalls in client workflows
- bundle loading and code splitting
- repeated global event listeners
- localStorage/sessionStorage use
- unnecessary re-renders
- expensive render work
- non-urgent UI updates
- long operational lists
- measured browser performance problems

Do not load this skill for ordinary UI styling.

## Measure before optimizing

Do not apply performance rules mechanically.

First identify:

- the slow interaction
- the expensive render
- the large bundle path
- the repeated network work
- the list or computation causing pressure

Prefer evidence from:

- browser performance tools
- React DevTools
- bundle output
- Playwright timing/behavior where useful

Do not rewrite clear code for speculative micro-optimization.

## Load only the relevant rule

### Async

- `rules/async-cheap-condition-before-await.md`
- `rules/async-defer-await.md`
- `rules/async-parallel.md`

### Bundle

- `rules/bundle-barrel-imports.md`
- `rules/bundle-analyzable-paths.md`
- `rules/bundle-conditional.md`
- `rules/bundle-defer-third-party.md`
- `rules/bundle-dynamic-imports.md`
- `rules/bundle-preload.md`

### Browser/client state

- `rules/client-event-listeners.md`
- `rules/client-passive-event-listeners.md`
- `rules/client-localstorage-schema.md`

### Re-render behavior

- `rules/rerender-defer-reads.md`
- `rules/rerender-dependencies.md`
- `rules/rerender-derived-state-no-effect.md`
- `rules/rerender-functional-setstate.md`
- `rules/rerender-lazy-state-init.md`
- `rules/rerender-memo.md`
- `rules/rerender-move-effect-to-event.md`
- `rules/rerender-no-inline-components.md`
- `rules/rerender-simple-expression-in-memo.md`
- `rules/rerender-transitions.md`
- `rules/rerender-use-deferred-value.md`
- `rules/rerender-use-ref-transient-values.md`

### Rendering

- `rules/rendering-animate-svg-wrapper.md`
- `rules/rendering-content-visibility.md`
- `rules/rendering-hoist-jsx.md`
- `rules/rendering-conditional-render.md`
- `rules/rendering-usetransition-loading.md`

### JavaScript hotspots

- `rules/js-batch-dom-css.md`
- `rules/js-index-maps.md`
- `rules/js-combine-iterations.md`
- `rules/js-early-exit.md`
- `rules/js-set-map-lookups.md`
- `rules/js-tosorted-immutable.md`

Do not load the whole rules directory automatically.

## Deliberately excluded upstream rules

Do not import upstream guidance that assumes:

- Next.js Server Components
- Next.js Server Actions
- Next.js `dynamic()`
- React Server Component serialization
- Vercel `after()`
- SWR as a required client data layer
- SSR hydration as an existing Elara concern

If Elara's architecture changes later, revisit those rules from current official
sources rather than activating stale guidance.

## Architecture boundary

Performance work must not weaken:

- mutation safety
- auth
- domain validation
- accessible interaction
- visible pending/failure state
- manual non-AI workflows

A faster wrong state is still wrong.

## Completion

A performance refactor is complete when:

- the targeted cost is reduced or the reasoning is concrete
- behavior remains correct
- accessibility remains intact
- TypeScript 6 and 7 pass
- relevant tests pass
- the code is not harder to maintain without measurable benefit

---

Adapted for Elara Relay from Vercel Labs' MIT-licensed
`react-best-practices` skill. Next.js- and RSC-specific guidance is
intentionally excluded.
