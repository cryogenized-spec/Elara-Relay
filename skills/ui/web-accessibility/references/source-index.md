# Accessibility Source Index

Use the source appropriate to the claim.

Specifications define normative requirements or platform behavior.

Tutorials and pattern libraries provide implementation guidance and must still
be tested in Elara's supported environment.

Status below was checked in September 2026.

## Primary standards

| Source | Current status | Use |
|---|---|---|
| WCAG 2.2 | W3C Recommendation | success criteria, levels, applicability, exceptions, conformance |
| WAI-ARIA 1.2 | W3C Recommendation | roles, states, properties |
| WAI-ARIA 1.3 | Working Draft | future direction only; do not treat as stable production baseline |
| ARIA Authoring Practices Guide | informative W3C guidance | widget interaction patterns and examples |
| Accessible Name and Description Computation 1.2 | current draft specification | difficult accessible-name/description edge cases |
| HTML Living Standard | WHATWG Living Standard | native HTML behavior |
| WAI evaluation guidance | informative W3C guidance | testing method and tool limitations |

Canonical sources:

- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- https://www.w3.org/TR/wai-aria-1.2/
- https://www.w3.org/TR/wai-aria-1.3/
- https://www.w3.org/WAI/ARIA/apg/
- https://www.w3.org/TR/accname-1.2/
- https://html.spec.whatwg.org/
- https://www.w3.org/WAI/test-evaluate/

## WCAG 2.2 additions relevant to Elara

WCAG 2.2 added criteria including:

- Focus Not Obscured (Minimum)
- Focus Not Obscured (Enhanced)
- Focus Appearance
- Dragging Movements
- Target Size (Minimum)
- Consistent Help
- Redundant Entry
- Accessible Authentication (Minimum)
- Accessible Authentication (Enhanced)

WCAG 2.2 also removed obsolete 4.1.1 Parsing.

Always read the actual criterion before applying:

- level
- exception
- scope
- definition

Do not rely on a shorthand list for a conformance decision.

## Elara product goals versus minimums

A standards minimum does not automatically become Elara's product target.

Example:

WCAG 2.2 has a 24 × 24 CSS pixel AA target-size criterion with defined
exceptions.

Elara's own mobile design target is approximately 44 × 44 CSS pixels for primary
controls.

Keep the stronger product goal unless there is a reviewed reason to change it.

## ARIA version discipline

Use WAI-ARIA 1.2 as the stable Recommendation baseline.

ARIA 1.3 may inform future awareness but should not be treated as a stable
requirement while it remains a draft.

Prefer native HTML semantics when the host language already provides the needed
behavior.

## Accessible names

For difficult accessible-name or description questions:

- consult the current Accessible Name and Description Computation specification
- inspect the browser accessibility tree
- test the actual rendered state

Do not substitute a memorized "ARIA naming priority" mnemonic for the algorithm.

## Pattern guidance

ARIA Authoring Practices examples are informative.

They show pattern contracts and possible implementations.

They do not prove that:

- the pattern is appropriate for Elara
- a copied example works in all browser/AT combinations
- a custom widget is preferable to native HTML

Test the adopted interaction in the actual supported environment.

## Testing guidance

Use WAI evaluation guidance to understand tool limits.

Automated tools cannot establish full WCAG conformance or successful task
completion by themselves.

## Upstream source

This Elara accessibility skill is adapted from:

`magnus919/agent-skills/web-accessibility`

License: MIT.

The Elara version preserves the upstream evidence discipline while replacing
generic framework routing with Elara's own React/Vite, mobile, product, and
domain boundaries.

## Freshness rule

Recheck the live authoritative source when a task depends on:

- exact criterion wording
- standards status
- a recent browser/platform behavior
- a draft feature
- a conformance claim

Do not freeze time-sensitive external guidance into Elara because an older skill
file mentioned it.
