# Elara Relay — Interface Review Guidelines

Use this reference when auditing implemented Elara UI.

These rules are adapted from Vercel Labs' Web Interface Guidelines and then
narrowed to Elara Relay's mobile-first React/Vite application, domain authority,
dark visual language, and existing Playwright verification.

The rules below are review guidance. Repository architecture and domain
invariants remain authoritative.

## 1. Semantics and keyboard interaction

Prefer native HTML semantics.

Use:

- `<button>` for actions
- `<a>` or router links for navigation
- `<label>` for form controls
- semantic headings and lists
- semantic tables when the content is actually tabular

Do not use clickable `div` or `span` elements as substitutes for controls.

Every interactive path must remain keyboard-operable.

Interactive elements need visible, unobscured focus.

Prefer `:focus-visible` for individual controls and `:focus-within` when a
compound control needs grouped focus indication.

Never remove the browser outline without providing an equally visible focus
replacement.

Fixed top bars, bottom navigation, sheets, and overlays must not obscure the
focused element.

Manage focus deliberately when opening and closing dialogs, sheets, menus, and
other overlays.

Return focus to a logical control when transient UI closes.

## 2. Touch targets and mobile input

Elara's primary controls should generally provide at least a 44 × 44 CSS pixel
touch target.

The glyph or visible control may be smaller than the hit area.

Avoid dead zones in controls that visually appear to be one target.

Checkboxes and radios should make the label and control one usable hit area.

Use `touch-action: manipulation` on ordinary tappable controls when
appropriate.

Do not disable browser zoom.

Avoid mobile autofocus unless opening the keyboard immediately is clearly the
best interaction.

Mobile text inputs should avoid behavior that triggers unwanted browser zoom.

## 3. Accessible names and status

Icon-only controls need a useful accessible name.

Decorative icons should be hidden from assistive technology.

Status must not rely on color alone.

Use a meaningful combination of:

- text
- icon
- restrained semantic color

Prefer native semantics before adding ARIA.

ARIA should clarify behavior, not compensate for an avoidable non-semantic
implementation.

Async status such as validation, save results, and important transient notices
should be exposed appropriately to assistive technology.

Automated accessibility checks are evidence, not a conformance verdict.

## 4. Forms

Every field needs an accessible label.

Use meaningful `name`, `type`, `autocomplete`, and `inputmode` values.

Do not block paste.

Do not silently discard text because it does not yet validate.

Allow the user to enter and correct values unless the platform itself supplies
a safer constrained control.

Validation should be:

- close to the relevant field
- specific
- actionable
- non-destructive to entered data

On submit, make the first actionable error easy to find and focus when
appropriate.

Keep entered values when a recoverable request fails.

Submit controls should remain usable until submission begins.

During an in-flight request:

- prevent accidental duplicate submission
- retain the original action label where practical
- communicate pending state clearly

Do not visually report success before the durable mutation succeeds.

Elara's mutation ID, replay, and revision protections remain server/domain
responsibilities; frontend behavior must not undermine them.

Warn before navigation when unsaved user work would otherwise be lost.

Do not use placeholders as the only labels.

## 5. Pending, failure, stale, and conflict states

System status must be truthful.

Distinguish:

- idle
- loading
- saving
- pending
- succeeded
- failed
- stale
- conflicted
- denied

Do not collapse materially different states into a generic spinner or
`Something went wrong`.

For a recoverable failure communicate:

1. what failed
2. what was preserved
3. what the user can do next

A stale revision must not be silently overwritten.

If a retry could duplicate a durable or external effect, do not present a naive
retry interaction.

Optimistic UI is optional, not a default requirement.

Use it only when:

- success is highly likely
- rollback or reconciliation is truthful
- no irreversible/external result is implied prematurely
- the domain's replay/revision safety remains intact

## 6. Navigation and state preservation

Navigation should use real links where navigation semantics apply.

Preserve browser Back/Forward behavior where the application flow depends on
it.

Stable, user-meaningful state may belong in the URL when doing so improves:

- deep linking
- re-entry
- sharing
- history navigation

Do not force every transient component state into the URL.

Examples that may deserve URL representation include:

- search query
- filters
- selected entity
- pagination
- stable view mode

Examples that usually remain local include:

- short-lived hover
- temporary animation state
- incidental expanded detail with no re-entry value

Preserve useful scroll/context when returning to a list or search where
practical.

## 7. Destructive and external actions

Destructive actions must have a risk-appropriate barrier.

Use confirmation, delayed commit, or real undo according to what the domain
actually supports.

Do not offer fake undo.

Customer- or supplier-facing actions must preserve Elara's explicit approval
boundary unless reviewed product policy says otherwise.

External-action UI should make the sequence understandable:

- prepare
- review
- approve
- execute
- confirm result

Do not visually blur draft/preparation with actual execution.

## 8. Motion

Respect `prefers-reduced-motion`.

Prefer CSS for simple transitions.

Animate properties such as:

- `opacity`
- `transform`

Avoid animating layout-heavy properties where a compositor-friendly treatment
can communicate the same state.

Never use `transition: all`.

List the intended properties explicitly.

Animations must not block interaction.

Motion should explain change rather than decorate the application.

Elara's normal transition range is approximately 120–180 ms.

Avoid:

- repeated entrance animation
- parallax
- springy overshoot
- perpetual decorative movement
- large zoom effects

## 9. Layout and alignment

Every element should align intentionally to a grid, baseline, edge, or optical
center.

Small optical corrections are acceptable when geometric centering looks wrong.

Use CSS layout primitives before measuring layout in JavaScript.

Prefer:

- grid
- flexbox
- intrinsic sizing
- content-driven height

Avoid fixed heights where padding and content should size the element.

Check nested border radii for visual coherence.

Avoid unwanted horizontal scroll.

Use clipping only when the design truly intends clipping; do not hide overflow
to conceal a broken layout.

## 10. Safe areas and mobile shell

Account for safe-area insets when content or controls reach device edges.

Pay particular attention to:

- top bar
- bottom navigation
- Capture action
- sheets
- fixed controls

Content must not disappear under bottom navigation.

Primary controls must remain reachable in the 405 × 720 reference frame.

Verify the 412 × 915 Android regression viewport separately.

## 11. Text resilience

Design for:

- short text
- ordinary text
- long customer names
- long product/model names
- long Repair findings
- long waiting reasons
- technical identifiers

Flex children that must shrink often need `min-width: 0`.

Use truncation only when hiding the remainder does not remove information needed
for the task.

Prefer wrapping or line clamping according to operational importance.

Do not let an unexpectedly long string break the mobile shell.

## 12. Typography and numbers

Follow `documents/Layout_Guide.md`.

Use Geist Sans for ordinary interface text.

Use Geist Mono selectively for technical identifiers and comparable technical
values.

Use tabular numerals where number-column alignment matters.

Avoid:

- gratuitous ALL-CAPS labels
- decorative eyebrows
- arbitrary monospace metadata
- oversized headings in operational screens

Use the ellipsis character `…` rather than three periods when an ellipsis is
actually intended.

Use non-breaking spacing where a unit or identifier would become confusing if
split.

## 13. Interface copy

Use plain, operational language.

Prefer specific action labels.

Examples:

- `Save changes`
- `Mark ready`
- `Retry`
- `Pause reminder`

Avoid generic labels such as:

- `Continue`
- `Proceed`
- `Submit`

unless the context makes their consequence completely clear.

Keep nouns consistent.

Use the same name for the same domain concept across screens.

Do not expose internal database, API, scheduler, or schema vocabulary to
ordinary users when an operational term exists.

Error messages should include a useful next action.

Do not copy Vercel's brand-specific Title Case or ampersand preferences into
Elara automatically.

Follow Elara's established interface voice and existing labels.

## 14. Empty, sparse, dense, and error states

Do not design only the ideal populated state.

Where applicable, inspect:

- empty
- sparse
- normal
- dense
- error
- loading
- stale/conflicted

An empty state should explain the absence and offer the correct next action.

Do not fill empty space with decorative illustration merely because the screen
looks sparse.

Dense operational data must remain scannable.

## 15. Images and media

Elara should avoid unnecessary media.

When images are used:

- provide appropriate alternate text
- mark decoration as decorative
- reserve dimensions to avoid layout shift
- lazy-load non-critical imagery where appropriate

Do not use animated GIFs for decorative looping motion.

Prefer no motion, a still asset, or efficient video only when the product
actually benefits from it.

## 16. Dark mode and browser chrome

Elara is dark-first.

Use an appropriate `color-scheme` so native controls and browser UI render
coherently.

Where supported, browser theme color should match the application background
rather than introducing an unrelated strip of color.

Native selects and other browser controls must retain readable foreground and
background contrast.

Do not rely on dark-mode defaults differing consistently across browsers.

## 17. Iconography

Use Iconify.

Prefer Solar.

Do not introduce Lucide.

Do not hand-draw replacement SVGs when a suitable approved icon exists.

Icon style should remain coherent within a screen.

Icon-only controls need accessible names.

Decorative icons should not become focusable or noisy in the accessibility
tree.

Do not place every icon inside a decorative circle.

## 18. Performance

Review performance problems that affect interaction quality.

Watch for:

- expensive work during render
- unnecessary re-renders
- layout thrashing
- large unbounded lists
- expensive controlled-input loops
- avoidable asset/layout shift

Use virtualization or `content-visibility` for genuinely large lists when the
data shape and interaction benefit from it.

Do not impose Vercel-specific hard thresholds such as a universal 500 ms
mutation budget as an Elara product rule unless the repository explicitly
adopts that threshold.

Measure before making performance claims.

## 19. Hydration and state stability

Inputs must not lose values or focus because of hydration/render churn.

Controlled inputs need a valid change path.

Date/time rendering must not produce avoidable server/client mismatch if SSR is
ever introduced.

Do not add hydration-specific complexity to the current Vite client simply
because the upstream guideline mentions Next.js.

Apply a rule only when the current architecture makes it relevant.

## 20. Visual anti-patterns

Flag:

- decorative gradients
- glassmorphism used as a default surface
- heavy shadow stacks
- saturated borders without semantic purpose
- card soup
- giant hero regions
- excessive pills
- icon backplates everywhere
- visual state conveyed only by color
- inconsistent icon sizing
- accidental fixed-height clipping
- decorative metrics
- arbitrary motion
- excessive empty space
- UI that looks like a generic SaaS template rather than an operational tool

Do not flag restrained deviation merely because it differs from Vercel.

The canonical visual authority is Elara's own Layout Guide.

## 21. Review evidence

Match the evidence to the finding.

Source inspection can prove:

- missing labels
- wrong element semantics
- `transition: all`
- absent reduced-motion handling
- obvious fixed-height hazards

Rendered screenshots can prove:

- clipping
- overlap
- bad spacing
- wrapping problems
- icon misalignment
- poor hierarchy

Keyboard/browser testing can prove:

- focus behavior
- keyboard reachability
- navigation behavior

Automated accessibility tools can identify issues but do not establish complete
WCAG conformance.

Do not report unobserved behavior as passing.

## 22. Required visual targets

For meaningful Elara presentation changes, verify:

- 405 × 720
- 412 × 915 Android portrait
- desktop Chromium

Check:

- first-screen usefulness
- horizontal overflow
- clipped controls
- safe-area collisions
- bottom-navigation overlap
- awkward wrapping
- icon consistency
- vertical centering
- touch-target size
- focus visibility
- state distinction

## 23. High-confidence findings

The following are normally worth reporting immediately when present:

- icon-only button with no accessible name
- form control with no accessible label
- clickable non-semantic element where native control is appropriate
- browser zoom disabled
- blocked paste
- invisible focus
- `outline: none` without replacement
- `transition: all`
- required meaning communicated only by color
- gesture-only required action
- destructive/external action bypassing required review
- save failure that discards user input
- stale-state overwrite
- success UI before durable/external confirmation
- content hidden underneath fixed navigation
- mobile primary control below a practical reachable viewport
- long text breaking the shell
- Lucide introduced into Elara
- UI-only lifecycle state contradicting the domain

---

Adapted from Vercel Labs' Web Interface Guidelines.

Copyright (c) 2025 Vercel Labs.
Used and adapted under the MIT License.
