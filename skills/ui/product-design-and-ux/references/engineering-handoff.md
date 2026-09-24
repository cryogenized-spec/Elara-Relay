# Engineering Handoff

A UX handoff should let implementation reproduce the intended behavior without
guessing.

It is not just a screenshot or mockup.

## Minimum handoff

For meaningful behavior changes, engineering should be able to determine:

- intended operational outcome
- affected domain object
- actor and permission
- entry point
- normal path
- applicable states and transitions
- recovery behavior
- durable or external side effects
- approval requirements
- responsive constraints
- accessibility expectations
- observable completion evidence
- unresolved decisions

Do not include artifacts that add no implementation value.

## Observable acceptance criteria

Write criteria at the user-facing boundary.

A strong criterion includes:

1. relevant starting state
2. action or event
3. visible result
4. durable or external effect
5. failure/recovery behavior where relevant
6. evidence that proves the result

Example:

> Given a Repair in Testing without a passing final test, Ready is not presented
> as a valid transition and the interface explains the required final-test
> condition.

Example:

> If saving a Task fails, the entered title and due date remain visible and
> retry cannot create a duplicate logical Task.

Avoid:

- works correctly
- is intuitive
- looks responsive
- handles errors
- is accessible

Those are claims, not testable behavior.

## Dependencies

For an important dependency identify:

- owner
- source or contract
- freshness/availability
- failure behavior
- privacy or authority boundary
- verification path

Relevant dependencies may include:

- domain contract
- PostgreSQL persistence
- Supabase Auth
- scheduler
- external provider
- product policy
- browser/platform behavior

A dependency with no understood failure behavior is a design risk.

## Handoff review

Walk through at least:

- the normal path
- the highest-risk applicable exception

Depending on the task, that exception may be:

- permission loss
- stale revision
- partial commit
- external-action failure
- interruption
- invalid Repair transition
- scheduler failure

Confirm the implementation does not need to invent the answer.

## Findings

Classify unresolved handoff issues as:

- **Blocking** — implementation would have to invent consequential behavior or
  violate an authority boundary
- **Conditional** — implementation can proceed up to a clearly defined gate
- **Nonblocking** — clarification improves quality without changing behavior or
  risk

Do not block implementation for documentation polish alone.

## Verification boundary

Component success does not prove integrated behavior.

For meaningful work identify the verification boundary.

Examples:

- domain test
- PostgreSQL integration
- authenticated API behavior
- Playwright user flow
- rendered 405 × 720 screenshot
- external provider response

Use the evidence that matches the claim.

A screenshot cannot prove durable persistence.

A unit test cannot prove visual hierarchy.

## UI verification

For meaningful presentation work, carry forward:

- 405 × 720 reference
- 412 × 915 Android regression
- desktop Chromium
- keyboard/focus behavior where relevant

Use `skills/ui/web-design-guidelines/SKILL.md` for post-implementation
interface audit.

Use `skills/ui/frontend-design/SKILL.md` for visual design decisions.

## Template

Use `../templates/engineering-handoff.md` when the change is large enough to
benefit from a written implementation package.

Do not create a handoff document for trivial polish.

## Completion

Handoff is sufficient when:

- consequential behavior is unambiguous
- implementation boundaries are clear
- acceptance criteria are observable
- dependencies and risks are known
- the correct verification path is identified
- unresolved decisions have an explicit gate
