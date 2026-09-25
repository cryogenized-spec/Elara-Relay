# Accessibility Routing

Keep the accessibility contract framework-agnostic first.

Then use the current implementation and official framework/platform
documentation to satisfy it.

Do not choose a component library merely because it advertises accessibility.

Verify the actual task behavior.

## Elara routing

| Situation | Authority |
|---|---|
| Product behavior, task flow, recovery | `skills/ui/product-design-and-ux/SKILL.md` |
| Visual hierarchy and presentation | `skills/ui/frontend-design/SKILL.md` |
| Post-implementation UI audit | `skills/ui/web-design-guidelines/SKILL.md` |
| Domain lifecycle or validation | `src/contracts/`, `src/domain/`, relevant `docs/` |
| React implementation | current Elara React code and current official React docs |
| Vite behavior | current Elara Vite config and current official Vite docs |
| HTML semantics | current HTML standard / browser behavior |
| ARIA roles and states | current WAI-ARIA Recommendation |
| Pattern guidance | WAI-ARIA Authoring Practices |
| Standards status | `source-index.md` |

## Boundary rule

Accessibility work may require a product behavior change.

If so, route the behavior question back to Product Design rather than inventing
a local accessibility-only workflow.

Examples:

- missing recovery path
- destructive action with no review
- inaccessible gesture-only design
- status visible only through transient animation
- form that discards data on failure

## Library rule

A library component is acceptable only when it meets the actual Elara contract.

Check:

- semantics
- keyboard behavior
- focus behavior
- responsive behavior
- supported browser behavior
- integration with dark theme
- touch target behavior

Do not assume library defaults are correct for Elara.

## Current-source rule

When a task depends on:

- framework API
- browser behavior
- standards wording
- assistive-technology behavior

consult the current authoritative source rather than copying a stale example from
this skill.
