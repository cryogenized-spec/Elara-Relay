---
name: "elara-product-design-and-ux"
description: "Define Elara Relay user-facing behavior before visual implementation. Use for information architecture, task flows, screen states, recovery, interaction contracts, responsive behavior, AI-assisted interactions, and engineering UX handoff."
---

# Elara Relay — Product Design & UX

Define what Elara must let a person understand, do, recover from, and verify
before deciding how the interface should look.

This skill owns:

- information architecture
- task and state flows
- interaction behavior
- recovery behavior
- responsive behavior contracts
- consequential action boundaries
- UX acceptance criteria
- engineering handoff

It does not own visual styling, CSS aesthetics, detailed WCAG interpretation,
or domain/business rules.

## Read first

Before meaningful UX work, read:

- `AGENTS.md`
- `documents/App_Direction.md`
- the relevant domain contract or documentation

Read `documents/Layout_Guide.md` when the task crosses into presentation.

Do not design from chat memory when the repository contains the current truth.

## Core rule

> The UI exposes Elara's domain. It does not invent a parallel product model.

Before adding a state, action, lifecycle, permission, or object concept,
identify the authority that owns it.

If required behavior is missing from the domain, treat that as a product or
architecture question rather than disguising it as frontend-only state.

## Workflow

For a meaningful surface or flow:

1. State the operational outcome.
2. Identify actor, authority, permissions, and entry point.
3. Identify the relevant domain object and lifecycle.
4. Model the shortest legitimate path to completion.
5. Identify states forced by real conditions.
6. Define recovery, interruption, and re-entry.
7. Define observable completion evidence.
8. Define responsive and accessibility expectations.
9. Hand stable behavior to visual design and implementation.

Do not invent every conceivable loading, empty, and error state.

Include a state because a real system, domain, permission, connectivity, or
user-behavior force makes it relevant.

## Load only what the task needs

Use the references in this directory selectively.

- Information structure, navigation, labels, findability:
  `references/information-architecture.md`
- Task paths, states, interruption, recovery:
  `references/task-flows-and-state-models.md`
- Interface behavior and responsive contracts:
  `references/interface-contracts-and-responsive-behavior.md`
- Labels, errors, cognitive demand:
  `references/content-and-cognitive-demand.md`
- Choosing interaction patterns:
  `references/interaction-pattern-selection.md`
- AI assistance, uncertainty, approval:
  `references/ai-interaction-and-uncertainty.md`
- Engineering acceptance and handoff:
  `references/engineering-handoff.md`
- Usability work:
  `references/usability-testing-and-privacy.md`
- Scope and traceability:
  `references/boundaries-and-traceability.md`
- Synthetic self-review scenarios:
  `references/scenario-probes.md`
- Upstream/source authority:
  `references/source-index.md`

Use templates only when the artifact they produce is actually needed.

Do not load the whole directory for a simple UI change.

## Elara-specific invariants

Keep these concepts distinct:

- Party
- Job
- Task
- Repair
- Scheduled Action
- Event

A Job is durable work.

A Task is an atomic action.

A Repair follows the Repair domain lifecycle.

A Scheduled Action is durable scheduling, not a browser timer.

Events are append-only historical truth.

`DueAt`, `FollowUpAt`, and Scheduled Actions are not interchangeable.

## Truthful behavior

Do not:

- report success before persistence or an external effect is confirmed
- silently overwrite stale revisions
- discard entered work on recoverable failure
- offer transitions the domain would reject
- imply visibility grants mutation authority
- expose implementation terminology when operational language is clearer
- hide consequential information behind decorative progressive disclosure

A task is complete when the intended operational result is observable, not when
a button was pressed.

## Mobile and interruption

Elara is mobile-first.

Treat interruption and re-entry as normal behavior.

For consequential flows consider:

- what survives navigation or app closure
- where the user returns
- whether permission or state must be revalidated
- whether filters or draft context should persist
- whether the underlying object may have changed meanwhile

Mobile determines information priority.

Desktop may expand the workflow but should not redefine it.

## AI and external actions

AI is optional.

AI may assist, draft, summarize, recommend, interpret, or prepare proposed
actions without automatically receiving authority to execute them.

Customer- or supplier-facing actions retain Elara's explicit approval boundary
unless reviewed policy intentionally changes it.

Consequential external actions should keep preparation, review, approval,
execution, and confirmed outcome visibly distinct.

## Handoff

Product-design work is ready for implementation when engineering can determine:

- the intended user outcome
- the domain authority
- applicable states and transitions
- consequential side effects
- recovery behavior
- permission and approval boundaries
- responsive behavior
- observable completion evidence
- unresolved decisions

If implementation still has to invent important behavior, the UX work is not
finished.

---

Adapted for Elara Relay from the MIT-licensed `product-design-and-ux` skill in
`magnus919/agent-skills`.
