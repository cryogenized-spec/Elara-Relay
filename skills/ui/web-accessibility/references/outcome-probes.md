# Accessibility Outcome Probes

Use these probes to stress-test an Elara design or implementation.

They are review prompts, not automated conformance tests.

## A. Capture sheet

Verify:

- useful accessible name
- logical initial focus
- background unavailable when modal
- keyboard-operable close
- logical focus restoration
- mobile keyboard does not break layout
- 44 × 44 primary touch targets
- no bottom-navigation overlap

Reject:

- focus trapped in a non-modal sheet
- focus returned to nowhere
- mobile autofocus that causes harmful layout shift without benefit

## B. Repair form recovery

A Repair finding save fails.

Verify:

- visible labels
- native form semantics
- specific associated error
- entered finding text preserved
- retry path reachable by keyboard
- success/failure perceivable without color alone
- no duplicate mutation caused by retry

Reject:

- cleared input
- generic error with no recovery
- success announced before persistence

## C. Primary mobile navigation

Verify:

- links remain links
- current destination exposed semantically
- visible focus
- logical order
- target size
- fixed bottom navigation does not cover focused content

Reject application-menu roles for ordinary Today / Work / Repairs / Schedule
navigation.

## D. Search control

Verify:

- useful accessible label
- keyboard reachability
- result count/status perceivable when it changes
- grouped results remain understandable in reading order
- return from result preserves useful context where intended

Reject icon-only search controls with no accessible name.

## E. Confirmation dialog

For a destructive or external action, verify:

- dialog name
- consequence explained
- initial focus appropriate to risk
- Cancel and close reachable
- background unavailable while modal
- focus restoration
- approval state not confused with execution success

Reject confirmation UI that visually approves and executes in one ambiguous
step when Elara requires explicit review.

## F. Custom combobox

Before accepting custom combobox code, require:

- documented role/state contract
- keyboard model
- focus model
- accessible name
- accessibility-tree inspection
- supported browser/AT testing
- evidence that native/select/search alternatives were insufficient

## G. Release verdict

Require evidence matched to the claim.

Reject:

- WCAG conformance based only on automated tooling
- screen-reader claims without actual AT testing
- keyboard claims without keyboard testing
- responsive claims from desktop screenshots only
- "accessible" as a conclusion when significant states remain untested

## Review question

For each probe ask:

- Can the user complete the task?
- Can they recover from failure?
- Is focus predictable?
- Is state perceivable without visual inference?
- Is the evidence direct?
- What remains unverified?
