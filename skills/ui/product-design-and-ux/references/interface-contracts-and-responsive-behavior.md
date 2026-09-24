# Interface Contracts and Responsive Behavior

An interface contract describes observable behavior.

It does not prescribe CSS classes, component names, pixel coordinates, or
internal service calls unless those details are themselves part of the required
behavior.

Use a written contract when implementation would otherwise have to invent
important interaction rules.

## Contract fields

For a meaningful surface or state, define only the fields that matter:

- linked outcome or task
- actor and entry conditions
- relevant domain object and current state
- visible content and its source
- controls and their purpose
- visible and accessible names
- enabled, disabled, or hidden rules
- validation timing and error behavior
- transition trigger and destination
- persistence or side effect
- permission check
- retry or deduplication concern
- recovery and re-entry
- completion evidence
- unresolved decision

Do not fill a template mechanically.

A contract exists to remove ambiguity, not create paperwork.

## Describe observable behavior

Prefer:

> Saving a Repair finding preserves the entered text until the server confirms
> persistence. On recoverable failure the text remains editable and Retry does
> not create a duplicate mutation.

over:

> Call updateRepair() and show toast.

Prefer:

> Closing the Capture sheet returns focus to the Capture control when that is
> still the logical origin.

over:

> Modal focus works.

Implementation may change while the behavior contract remains valid.

## Permission and authority

A control being visible does not imply the action is authorized.

For consequential actions define:

- whether the user may see the object
- whether they may perform the action
- when authority is rechecked
- what happens if authority changed meanwhile

AI assistance does not inherit operator authority automatically.

Customer- or supplier-facing execution retains the reviewed approval boundary.

## Commit and completion

For durable or external actions identify the commit boundary.

Distinguish:

- local edit
- submitted request
- pending durable mutation
- confirmed persistence
- prepared external action
- approved external action
- executed external action
- confirmed external outcome

Do not use one success state for several of these stages.

## Responsive behavior

Do not model responsiveness only as device names.

For the affected surface consider what changes under:

- narrow width
- 405 × 720 primary frame
- 412 × 915 Android regression frame
- wider desktop
- text expansion
- long domain content
- orientation change
- keyboard versus touch
- reduced motion
- degraded connectivity
- interruption and re-entry

Record what may:

- wrap
- stack
- collapse
- scroll
- remain fixed
- move to another region

while preserving meaning and action.

## Mobile hierarchy

Mobile determines information priority.

Desktop may add:

- wider columns
- split views
- persistent navigation
- larger tables

Desktop must not require a different mental model for the same task.

If a feature only works because desktop has extra space, decide explicitly how
the mobile task remains complete.

## Text expansion and long content

Elara must handle realistic operational strings.

Examples:

- long customer names
- long product/model names
- long findings
- waiting reasons
- technical identifiers

Define which content:

- must wrap
- may truncate
- may line-clamp
- must remain fully inspectable

Do not truncate information required to make the current decision.

## Input methods

For important controls define behavior for:

- keyboard
- touch
- pointer

Avoid essential drag-only interaction.

The visible control may be smaller than its touch target, but primary mobile
targets should follow the Layout Guide's approximately 44 × 44 CSS pixel rule.

## Focus

For overlays, sheets, dialogs, and navigational transitions consider:

- initial focus
- focus containment where appropriate
- focus return
- visibility of focus
- whether fixed chrome obscures the focused element

Do not write only "accessible."

Describe the observable behavior.

## Reduced motion

Meaning must survive with motion disabled.

Animation may explain state change but may not be the only way state is
communicated.

## Degraded connectivity

Where relevant define:

- what remains visible
- what remains editable
- what becomes unavailable
- what can be retried
- whether data is stale
- whether retry could duplicate a side effect

Do not imply offline support where the application does not actually provide it.

## Re-entry

For interruptible work define what is restored or revalidated:

- draft
- selected entity
- filters/search
- step
- current domain revision
- permission
- pending status

The correct answer may be "nothing is persisted" for low-risk temporary state.

Make that deliberate rather than accidental.

## Accessibility boundary

An interaction contract should carry requirements such as:

- keyboard reachability
- meaningful accessible name
- expected role/state
- focus outcome
- error recovery
- reflow
- reduced-motion behavior
- non-color status cues

Detailed WCAG/ARIA selection and conformance evidence belong to the dedicated
accessibility review layer.

## Review gate

Reject or revise a contract when:

- a transition has no recovery
- a durable mutation lacks completion evidence
- failure can destroy entered work unnecessarily
- stale state can be overwritten silently
- an unavailable action is unexplained
- responsive behavior is deferred vaguely to "the frontend"
- an external effect bypasses review/approval
- implementation would still need to invent consequential behavior

Use `../templates/interface-contract.md` when a written contract will improve
handoff or review.
