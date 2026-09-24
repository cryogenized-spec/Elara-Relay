# Accessibility Testing and Evidence

Accessibility evidence must match the claim being made.

Automated checks are useful, but they do not prove complete task accessibility
or WCAG conformance.

## Automated evidence

Automated tooling can often detect issues such as:

- missing accessible names
- invalid ARIA combinations
- some label failures
- some contrast failures
- duplicate identifiers
- detectable semantic violations

Automation usually cannot reliably decide:

- whether a label is understandable
- whether alternative text conveys purpose
- whether focus order makes sense
- whether a custom widget's whole keyboard model works
- whether status timing is useful
- whether an error is recoverable
- whether a screen-reader user can complete the task

Treat a passing automated result as bounded evidence.

## Test real states

Run checks against material states, not only the initial render.

Depending on the feature, include:

- open / closed
- valid / invalid
- enabled / disabled
- selected / unselected
- loading / complete
- failed
- stale / conflicted
- mobile / desktop

A rule may "pass" simply because the relevant state never appeared.

## Keyboard protocol

Complete the relevant task with keyboard alone.

Test:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- pattern-specific arrow keys
- Home / End where applicable

Record:

- focus order
- visible focus
- hidden/obscured focus
- traps
- focus restoration
- failure-state recovery
- unexpected context changes

## Accessibility tree

Inspect key states in the browser accessibility tree.

Record where relevant:

- role
- name
- description
- state
- value
- relationships
- hidden/inert exposure
- live updates

Do not infer the computed accessible name from JSX alone when the result is
ambiguous.

## Screen-reader evidence

When the task or risk justifies it, test an actual supported browser/screen-reader
combination.

Record:

- browser
- browser version
- assistive technology
- assistive-technology version
- task
- state
- observed output
- defect or result

Do not claim universal screen-reader behavior from one combination.

## Adaptive UI

For relevant surfaces test:

- zoom
- reflow
- text expansion
- long content
- reduced motion
- touch/pointer
- target sizing
- drag alternatives
- orientation
- 405 × 720
- 412 × 915 Android portrait
- desktop Chromium

Use the exact evidence needed for the criterion.

## Playwright

Playwright can provide useful repeatable evidence for:

- keyboard flows
- focus visibility/state
- semantic locators
- aria snapshots
- mobile viewports
- responsive regressions

Use user-facing locators where practical.

Do not update snapshots blindly to make a failure disappear.

A Playwright pass still does not prove every assistive-technology behavior.

## Evidence record

For an important criterion record:

| Field | Value |
|---|---|
| Criterion / requirement |  |
| Environment |  |
| State |  |
| Method |  |
| Evidence |  |
| Result | pass / fail / blocked / not applicable |
| Limitation |  |

## Release rule

Each in-scope accessibility criterion should have:

- pass with direct evidence
- fail
- blocked
- or explicit not applicable

Do not convert:

- untested
- automation did not flag
- screenshot looks fine

into a pass.

Report residual risk plainly.
