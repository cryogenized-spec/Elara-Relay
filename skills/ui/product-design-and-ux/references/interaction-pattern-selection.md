# Interaction Pattern Selection

UI patterns are hypotheses, not automatic answers.

Choose a pattern because it fits the operational task, not because it is
familiar, fashionable, or available in a component library.

## Decide from forces

For a consequential interaction consider:

- frequency
- urgency
- reversibility
- data volume
- comparison needs
- uncertainty
- permissions
- connectivity
- interruption
- mobile ergonomics
- accessibility

Prefer the simplest familiar interaction that satisfies those forces.

## Forms

Ask:

- When can validity be known?
- Is input preserved on failure?
- Can errors be corrected without losing context?
- Is the form small enough to remain one mobile surface?
- Would splitting it into steps actually help?

Do not create a wizard merely to make a short form feel designed.

## Search and filtering

Decide whether the user is:

- locating a known object
- narrowing a large set
- exploring
- comparing

Then choose filtering, grouping, pagination, or search behavior accordingly.

Handle:

- active filters
- zero results
- stale results
- re-entry
- return-to-position

Do not treat all search tasks as a command palette if the user needs sustained
comparison.

## Dense operational lists

For Jobs, Tasks, Repairs, and Scheduled Actions identify:

- which values support scanning
- which values support comparison
- which action must remain reachable
- what narrow width does to meaning

Do not solve dense data by wrapping every row in a large decorative card.

## Progressive disclosure

Use disclosure when hidden information is not needed for the current decision.

Do not hide:

- consequence
- authorization requirement
- destructive effect
- important state
- recovery
- uncertainty relevant to action

The reveal control must remain discoverable and reachable.

## Confirmation

Confirmation is appropriate when the interruption matches the risk.

Avoid repeated confirmation for routine reversible actions because users learn
to dismiss it automatically.

For higher-risk effects consider:

- confirmation
- preview
- delayed commit
- explicit approval
- typed intent

Choose the least burdensome mechanism that genuinely reduces the risk.

## Undo

Offer undo only when restoration is real.

A visual Undo control is invalid if the domain cannot safely restore the prior
state.

Where recovery is impossible, communicate consequence before commit.

## Optimistic updates

Optimistic UI is optional.

Use it only when:

- success is likely
- rollback or reconciliation is trustworthy
- failure remains understandable
- stale/conflicting state is handled
- no external/irreversible success is implied prematurely

Elara's mutation and revision protections remain authoritative.

Do not make the UI look committed before the system knows it is committed.

## Autosave

Autosave must answer:

- when the commit occurs
- how pending state is shown
- what happens on failure
- what happens with stale state
- whether interruption loses work

Do not introduce autosave simply to avoid a Save button.

## Pagination, load-more, and infinite scroll

Choose based on task.

Infinite scroll may work for exploration but can weaken:

- return-to-position
- bounded review
- comparison
- audit
- completion sense

Operational lists often benefit from explicit continuation or pagination.

## Sheets, dialogs, and inline editing

Use a bottom sheet when it supports the mobile task and preserves context.

Use a dialog when the action needs temporary focus or confirmation.

Use inline editing when context and comparison matter more than isolation.

Do not turn every action into a modal.

## Pattern review

For a consequential pattern record, briefly:

1. user goal
2. forces
3. plausible alternatives
4. main tradeoff
5. selected approach
6. what would cause reconsideration

Do not produce a formal decision record for routine spacing or styling work.

## Completion

A pattern choice is sound when:

- it matches the real task
- its failure modes are understood
- recovery remains possible where the domain allows it
- mobile and accessibility constraints are respected
- the interaction does not weaken Elara's authority boundaries
