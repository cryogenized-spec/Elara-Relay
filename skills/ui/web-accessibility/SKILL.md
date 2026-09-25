---
name: "elara-web-accessibility"
description: "Design, implement, and review accessible Elara Relay web interfaces. Use for keyboard and focus behavior, semantics, names, forms, dialogs, responsive input, motion, WCAG-informed review, and accessibility evidence."
---

# Elara Relay — Web Accessibility

Accessibility is successful task completion and recovery for disabled people,
not a tool score.

Use native platform behavior first, define observable interaction requirements,
and verify with evidence appropriate to the claim.

## Standards baseline

For Elara's current accessibility work:

- WCAG 2.2 is the current W3C Recommendation baseline
- WAI-ARIA 1.2 is the current W3C Recommendation
- WAI-ARIA 1.3 exists as a draft and must not be treated as stable production
  authority unless a task explicitly requires it

Check `references/source-index.md` when exact standards status matters.

## Read first

For meaningful accessibility work, read:

- `documents/Layout_Guide.md`
- the affected UI implementation
- the relevant behavior contract, if one exists

Load only the focused reference required by the task.

## Workflow

1. Identify the user task and interaction.
2. Prefer native HTML semantics.
3. Define names, roles, states, keyboard behavior, focus, feedback, and recovery.
4. Consider reflow, zoom, touch, reduced motion, and long content.
5. Implement or review the smallest correct interaction.
6. Verify with source inspection, browser behavior, Playwright, and assistive
   technology evidence as appropriate.
7. Record failed, blocked, and unverified behavior honestly.

Do not infer complete accessibility from an automated scan.

## Load on demand

- Native semantics and accessible names:
  `references/semantics-and-names.md`
- Keyboard, focus, and route changes:
  `references/keyboard-focus-and-routing.md`
- Forms, errors, and authentication:
  `references/forms-errors-authentication.md`
- Dialogs, disclosures, and navigation:
  `references/dialogs-disclosures-navigation.md`
- Composite widgets:
  `references/composite-widgets.md`
- Reflow, zoom, targets, motion, drag, and media:
  `references/visual-input-and-motion.md`
- Testing and evidence:
  `references/testing-and-evidence.md`
- Skill and architecture boundaries:
  `references/routing.md`
- Synthetic outcome probes:
  `references/outcome-probes.md`
- Standards and source authority:
  `references/source-index.md`

Do not load the full directory for a simple issue.

## Elara baseline

Elara already expects:

- visible keyboard focus
- no color-only status meaning
- approximately 44 × 44 CSS pixel primary mobile targets
- no essential drag-only interaction
- sensible reflow
- reduced-motion support
- accessible dark-mode contrast
- mobile-first behavior
- semantic controls
- Iconify with accessible treatment

These product goals may exceed a particular WCAG minimum.

Do not reduce them merely because a standard allows a smaller threshold.

## Native semantics first

Prefer:

- `button`
- `a`
- `label`
- `input`
- `select`
- `textarea`
- `table`
- `dialog`

when their native behavior matches the task.

ARIA changes semantics.

It does not create keyboard behavior, focus management, validation, or visual
feedback automatically.

## Evidence boundary

Match evidence to the claim.

Source inspection can show missing semantics or labels.

Browser testing can show focus and keyboard behavior.

Screenshots can show visual focus, reflow, clipping, and contrast concerns.

Automated tools can identify classes of defects.

Assistive-technology testing can show behavior in a specific supported
environment.

None of these alone establishes full WCAG conformance.

## Completion

Accessibility work is complete when each in-scope acceptance criterion has:

- direct evidence
- a failed result
- a blocked result
- or an explicit not-applicable reason

Do not turn absent testing into a pass.

---

Adapted for Elara Relay from the MIT-licensed `web-accessibility` skill in
`magnus919/agent-skills`.

Current standards status checked against W3C sources in September 2026.
