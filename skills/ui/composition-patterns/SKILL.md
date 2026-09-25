---
name: "elara-composition-patterns"
description: "Design and refactor Elara Relay React component APIs so they remain explicit, composable, and maintainable. Use for boolean-prop proliferation, reusable component APIs, shared state, compound components, providers, variants, and React 19 ref patterns."
---

# Elara Relay — React Composition Patterns

Keep Elara's React UI easy to understand and hard to misuse.

Use composition when a component is accumulating modes, booleans, hidden state
coupling, or feature-specific branches.

This skill does not authorize a second product/domain state model.

UI composition must remain subordinate to Elara's existing domain and state
authorities.

## Apply when

Use this skill for:

- reusable UI components
- component API design
- boolean prop proliferation
- compound components
- shared UI state
- providers/context
- explicit visual/behavior variants
- ref forwarding/exposure
- component refactors that affect several screens

Do not load this skill for simple spacing or copy changes.

## Load only the relevant rule

- Boolean prop proliferation:
  `rules/architecture-avoid-boolean-props.md`
- Compound components:
  `rules/architecture-compound-components.md`
- Explicit variants:
  `rules/patterns-explicit-variants.md`
- Children versus render props:
  `rules/patterns-children-over-render-props.md`
- Context interface:
  `rules/state-context-interface.md`
- Provider/state implementation:
  `rules/state-decouple-implementation.md`
- Lifting shared state:
  `rules/state-lift-state.md`
- React 19 refs:
  `rules/react19-ref-as-prop.md`

Do not load every rule automatically.

## Elara boundaries

Before creating shared UI state, ask:

1. Is this truly presentation state?
2. Does the domain already own it?
3. Does an existing provider/store/controller already own it?
4. Will this create a parallel authority?

Do not create a second:

- domain store
- auth authority
- scheduler
- persistence authority
- lifecycle controller
- API client

merely to simplify a component API.

## Default preference

Prefer component APIs that make valid use obvious.

Good APIs tend to have:

- explicit variants
- small stable interfaces
- composition of children
- clear state ownership
- few mode flags
- no impossible prop combinations

Do not abstract before repeated structure or behavior justifies it.

A little duplication is often cheaper than a premature universal component.

## React 19

Elara uses React 19.3.

For new function components, prefer React 19's ref-as-prop model where a ref is
actually needed.

Do not introduce `forwardRef` by habit.

Do not replace ordinary `useContext` usage merely because React 19 also
supports reading Context with `use()`.

Choose the API that makes the component simplest and remains compatible with
Elara's current React version.

## Review

When refactoring component architecture, verify:

- behavior did not change unintentionally
- accessibility semantics remain intact
- state ownership remains clear
- the component API cannot easily express impossible combinations
- TypeScript 6 and native TypeScript 7 still pass
- relevant UI tests still pass
- visual output remains correct where presentation changed

## Completion

Composition work is complete when the component API is easier to reason about
than before without introducing a new authority or abstraction layer.

---

Adapted for Elara Relay from Vercel Labs' MIT-licensed
`composition-patterns` skill.
