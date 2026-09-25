# Visual Layout, Input, Motion, and Media

Accessibility includes visual adaptation, input alternatives, and motion
behavior.

Elara's mobile product goals may exceed a particular WCAG minimum.

Do not reduce the product standard merely because a smaller threshold might
technically conform.

## Color and contrast

Do not use color alone to communicate:

- status
- error
- success
- selection
- warning
- destructive state

Use text, iconography, structure, or another redundant cue.

Evaluate text and meaningful UI contrast against the applicable current WCAG
criteria.

Do not rely on visual impression alone when a claim depends on a numeric
threshold.

## Reflow and zoom

Verify that important content remains usable under:

- browser zoom
- narrow viewport
- text resize
- text-spacing changes
- long content
- mobile orientation change

Avoid fixed dimensions that clip:

- labels
- errors
- status
- controls
- long customer/product text

Elara's primary composition target remains 405 × 720, but accessibility review
must also test adaptation beyond that ideal frame.

## Text expansion

Content should survive larger text without:

- overlapping controls
- hidden labels
- unreachable actions
- horizontal scrolling that destroys the task
- fixed-height clipping

Do not truncate information required for the current decision.

## Target size

WCAG 2.2 includes a 24 × 24 CSS pixel AA minimum target criterion with defined
exceptions.

Elara's product target for primary mobile controls is approximately 44 × 44 CSS
pixels.

Use the larger Elara target unless there is a deliberate reason not to.

The visible glyph may be smaller than the hit area.

## Input alternatives

When an action uses:

- drag
- swipe
- pinch
- path gesture

provide an ordinary single-pointer and keyboard alternative unless the movement
is genuinely essential.

Do not make a gesture the only way to reorder, dismiss, navigate, or execute a
required action.

## Motion

Respect `prefers-reduced-motion`.

Motion should communicate cause and effect, not decorate Elara.

Prefer subtle state transitions.

Avoid:

- parallax
- springy overshoot
- perpetual motion
- repeated entrance animation
- large zoom effects

Do not rely on animation to communicate the only indication of a state change.

## Automatic movement and updates

Automatically moving, blinking, scrolling, or updating content may require
additional controls under WCAG depending on duration and behavior.

Elara should normally avoid such presentation entirely.

If auto-updating operational content is introduced, verify that it:

- does not steal focus
- does not remove controls
- does not repeatedly interrupt assistive technology
- does not make the current task impossible to finish

## Flashing content

Do not introduce flashing visual effects into Elara.

If a future feature genuinely requires rapidly changing visual content, assess
it against the applicable standard rather than guessing from appearance.

## Media

Elara's operational UI should use media only when it serves the task.

When synchronized media is meaningful, verify the applicable requirements for:

- captions
- audio description
- transcript or textual equivalent
- keyboard-operable controls

Do not assume a transcript universally substitutes for other required media
alternatives.

## Loading states

Loading and skeleton UI must not:

- obscure current focus
- cause severe layout shift
- remove the action currently being used
- trigger excessive live-region announcements
- create unnecessary animation under reduced-motion preference

A very fast operation does not necessarily need a visible spinner.

Avoid visual flicker.

## Evidence

Use the correct evidence for the claim.

Screenshots can show:

- clipping
- overlap
- reflow
- target layout
- visual status cues

They cannot prove:

- keyboard operation
- screen-reader output
- gesture alternatives

Test those behaviors directly.

## Completion

Visual/input accessibility is acceptable when:

- content survives relevant zoom/reflow/text expansion
- state does not depend on color alone
- primary mobile targets meet Elara's ergonomic goal
- gestures have alternatives
- reduced motion is respected
- focus remains usable during dynamic change
- media requirements are met where applicable
