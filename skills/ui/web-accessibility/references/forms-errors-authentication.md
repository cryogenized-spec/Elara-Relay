# Forms, Errors, and Authentication

Use native form behavior where it fits.

Elara forms should remain understandable, correctable, and recoverable without
requiring visual inference.

## Structure

Prefer a native `form`.

Give each control a visible label.

Use semantic input types and meaningful autocomplete values when they match the
data.

Group related controls with `fieldset` and `legend` when the relationship
matters.

Do not use placeholder text as the only label.

## Constraints and help

Explain important constraints before submission when doing so prevents avoidable
failure.

Keep help close to the control it explains.

Do not bury required format rules in a tooltip.

## Validation

Validation must be identifiable without color alone.

For invalid fields:

- describe what is wrong
- explain how to correct it
- preserve entered values
- associate help/error text with the control when useful
- expose invalid state appropriately

Do not add ARIA mechanically when native semantics already convey the state.

Choose native validation, custom validation, or a combination deliberately.

Do not add `novalidate` by habit.

## Submission errors

For recoverable failure:

- preserve entered data
- identify the failed action
- expose a useful correction or retry path
- do not force the operator to reconstruct valid values

When several errors appear, decide whether an error summary would materially
help.

If focus moves to a summary, the summary must support reaching the affected
fields.

Do not use assertive announcements by default.

## Consequential submissions

For actions that are destructive, external, or difficult to reverse, provide a
risk-appropriate review or approval step.

Accessibility does not replace Elara's domain approval boundary.

Do not make an approval control inaccessible merely because the underlying
action is rare.

## Success

Expose successful save/submission in a perceivable way.

Do not steal focus from unrelated work merely to announce success.

Do not report success before durable persistence or the external effect is
confirmed.

## Input preservation

A failed save should not erase:

- Task title
- Repair finding
- Waiting reason
- follow-up date
- Scheduled Action input

when the failure is recoverable and preserving the value is safe.

This is both a usability and accessibility requirement.

## Authentication

Support password managers and paste.

Do not block one-time-code paste.

Do not require unnecessary cognitive puzzles as part of authentication.

When evaluating accessible authentication, use the current WCAG criterion and
its exceptions rather than a simplified memory rule.

Elara currently uses Supabase Auth at the authentication boundary; accessibility
work must not weaken authentication security.

## Error and help associations

Useful techniques may include:

- native label association
- `aria-describedby`
- `aria-invalid`
- focused error summary
- polite live status

Choose only what the flow needs.

Do not treat `aria-errormessage` or live regions as universal defaults.

## Evidence questions

Test whether a keyboard and screen-reader user can:

- find instructions
- identify every field
- submit
- understand an error
- reach the affected control
- correct it without re-entering preserved data
- perceive successful completion

Record observed behavior, not assumed screen-reader output.
