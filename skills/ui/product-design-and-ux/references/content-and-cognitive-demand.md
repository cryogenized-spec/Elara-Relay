# Content and Cognitive Demand

In Elara, wording is part of behavior.

Labels, status, errors, confirmations, and empty-state copy determine whether the
operator understands what is happening and how to recover.

Do not treat interface copy as decorative polish added after implementation.

## Use operational language

Prefer the terms the operator needs to act.

Examples:

- Ready for collection
- Waiting for supplier
- Follow-up
- Repair stage
- Save changes
- Retry

Avoid implementation-facing language such as:

- mutation
- row
- enum
- occurrence key
- execution lease
- transport failure

unless the surface is explicitly technical/admin-facing.

Use the same noun for the same concept across screens.

Do not introduce synonyms merely to make copy sound varied.

## Consequential content

For wording that affects decisions or recovery, identify:

- who reads it
- what task they are performing
- what state the system is in
- what consequence matters
- what action is available next
- whether the content can become stale

Examples include:

- validation errors
- destructive confirmations
- approval prompts
- Waiting reasons
- final-test status
- scheduled-action status
- save failures
- stale/conflict warnings

## Error content

A useful recoverable error answers:

1. What failed?
2. What was preserved?
3. What can I do now?

Do not blame the operator.

Do not apologize generically.

Do not claim completion before the durable or external result is known.

Prefer:

> Couldn’t save the Repair finding. Your text is still here. Try again.

over:

> Something went wrong.

If self-recovery is impossible, state the next available route rather than
presenting a dead end.

## Status language

Status text should describe real product state.

Distinguish where relevant:

- loading
- saving
- pending
- waiting
- paused
- failed
- stale
- conflicted
- ready
- completed
- cancelled

Do not use one vague word such as `Pending` for materially different states.

Status color is supplementary.

The text and icon should remain understandable without color.

## Reduce recall

Prefer recognition over memory.

Ask:

- Is the operator forced to remember a Job key that could remain visible?
- Must they remember what changed on another screen?
- Are important waiting/follow-up details hidden?
- Does returning after interruption require reconstructing context?
- Is the current Repair stage obvious without opening history?

Keep high-value context visible when memory failure would slow or endanger the
task.

## Choice and comparison

Options should differ in consequences the operator can understand.

Do not split one decision into several screens merely to reduce the number of
visible choices.

Do not group unlike actions under one generic button label.

When comparison matters, preserve the information needed to compare.

## Context switching

Elara often connects:

- Jobs
- Tasks
- Repairs
- Scheduled Actions
- Parties
- Timeline Events

When a flow crosses surfaces, preserve:

- object identity
- current state
- return path
- relevant filters/search context

Do not make the operator repeatedly navigate away simply to recover information
that belongs in the current decision.

## Interruption

After interruption, make it possible to determine:

- what was saved
- what remains unsaved
- what is pending
- what changed meanwhile
- what action is safe next

This is especially important on mobile.

## Guidance

Prefer guidance at the point where a decision is made.

Do not front-load ordinary workflows with long instruction text.

Experienced operators should not have to repeatedly dismiss explanations they
no longer need.

Inline help normally outranks tooltips.

Use tooltips when the content is genuinely supplementary rather than necessary
to understand the control.

## Progressive disclosure

Progressive disclosure may reduce scanning.

It becomes harmful when it hides:

- consequence
- status
- authorization
- required comparison
- destructive effect
- uncertainty
- recovery

Do not hide important information merely to make the screen look cleaner.

## Heuristic review prompts

Use these questions to generate review leads:

- Is system status timely and truthful?
- Does language match Elara's domain?
- Can the operator recover from mistakes or failure?
- Is necessary context visible?
- Are similar actions consistent?
- Are unlike actions incorrectly forced into one pattern?
- Does the interface prevent consequential mistakes at the correct boundary?
- Can the operator resume after interruption?
- Does every error preserve work where recovery permits?
- Is there a useful next step from every state?

A heuristic concern is not proof by itself.

Tie consequential findings to source behavior, rendered evidence, domain rules,
or explicit assumptions.

## Completion

Content and cognitive-demand review is sufficient when:

- labels use consistent operational language
- status accurately reflects state
- errors provide recovery
- important context does not rely on memory unnecessarily
- interruption is understandable
- progressive disclosure does not hide consequence or recovery
- the operator can identify the next useful action
