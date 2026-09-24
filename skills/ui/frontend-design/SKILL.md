---
name: "elara-frontend-design"
description: "Design and refine Elara Relay interface presentation after product behavior is understood. Use for layout, hierarchy, typography, spacing, surfaces, iconography, motion, responsive polish, and screenshot-based visual critique."
---

# Elara Relay — Frontend Design

Design Elara as a professional operational instrument.

This skill owns visual presentation. It does not invent domain behavior,
permissions, lifecycle rules, persistence semantics, or approval boundaries.

Before meaningful UI work, read:

- `documents/Layout_Guide.md`
- the existing implementation for the affected surface
- any approved behavior or product contract relevant to the task

Read `documents/App_Direction.md` only when the product purpose of the surface
is unclear.

## Design stance

Elara should feel:

- quiet
- precise
- compact
- technically confident
- mobile-first
- information-dense without visual noise

Distinctiveness does not mean adding decoration.

For Elara, good visual design means that the current state, next useful action,
and important exception are immediately legible without making the interface
feel busy.

Do not redesign the product into a marketing site.

## Start from the real task

Before editing code, identify:

1. What question is this screen answering?
2. What deserves attention first?
3. What information is secondary?
4. What action is primary?
5. What existing Elara pattern should remain consistent?

Use real domain content and states when evaluating the design.

Do not judge a screen using only ideal placeholder content.

## Make a small visual plan

For substantial presentation work, decide the following before coding:

- hierarchy
- density
- alignment
- surface treatment
- typography emphasis
- state emphasis
- icon treatment
- motion, if any

Keep the plan brief.

Do not invent a new design system for each screen.

The canonical tokens and constraints in `documents/Layout_Guide.md` outrank
personal aesthetic preference.

## Hierarchy

Every screen should have one clear visual priority.

Prefer:

- one strong summary region
- grouped rows and sections
- thin dividers
- restrained surface changes
- meaningful whitespace

Avoid:

- several equally dominant cards
- oversized headings
- decorative dashboards
- large empty areas added only to feel premium
- visual emphasis unrelated to operational importance

Current operational state usually outranks history.

Primary actions should be easy to find without overpowering the content.

## Typography

Use Geist Sans for normal interface text.

Use Geist Mono selectively for genuinely technical material such as:

- Job keys
- identifiers
- timestamps
- revisions
- system metadata

Do not make ordinary labels look like terminal output.

Use type size, weight, spacing, and placement to establish hierarchy.

Avoid generated-interface habits such as:

- unnecessary ALL-CAPS labels
- decorative eyebrow text above every section
- emphasizing one random word in a heading
- excessive micro-labels
- clever copy where plain language is clearer

## Surfaces and shape

Use Elara's dark neutral surface hierarchy.

Depth should normally come from subtle surface contrast and hairline borders.

Avoid:

- decorative gradients
- neon glow
- general-purpose glassmorphism
- heavy shadows
- saturated borders
- card soup
- pill-shaped ordinary buttons

A card or panel must communicate grouping, hierarchy, or interaction.

If removing the container changes nothing, the container may not be needed.

## Iconography

Use Iconify only.

Preferred family:

`solar`

Do not introduce Lucide.

Use another Iconify family only when Solar genuinely lacks the needed concept
and the alternative remains visually compatible.

Icons should clarify actions or state, not decorate empty space.

Do not:

- hand-draw replacement SVGs when a suitable Iconify glyph exists
- put every icon inside a circle
- use an icon without a label when its meaning is ambiguous
- confuse glyph size with touch-target size

Follow the sizing and touch-target rules in `documents/Layout_Guide.md`.

## Motion

Motion should explain change.

Use it for things such as:

- opening
- closing
- expanding
- collapsing
- confirming a state transition

Keep normal UI motion subtle and short.

Prefer the existing 120–180 ms guidance.

Avoid:

- page-wide entrance choreography
- repeated fade-and-rise effects
- springy overshoot
- parallax
- perpetual animation
- motion added only because the interface feels static

Respect reduced-motion preferences.

If removing an animation makes the interface equally understandable, consider
removing it.

## Interface copy

Words are part of the design.

Use plain operational language.

Prefer:

- `Save changes`
- `Ready for collection`
- `Try again`

over vague or implementation-oriented language such as:

- `Submit`
- `READY_STATE`
- `Re-execute`

Keep action names consistent through the flow.

Errors should explain what happened and what the user can do next.

Empty states should help the user continue rather than provide decorative copy.

## Avoid generic AI UI

Before finishing, inspect the screen specifically for generated-design habits.

Remove or justify:

- repeated rounded cards
- ornamental gradients
- excessive pills
- unnecessary icon backplates
- giant hero-like headers
- repeated decorative labels
- arbitrary monospace text
- decorative metrics
- excessive shadows
- excessive animation
- identical visual weight across unrelated content

Do not add novelty merely to avoid looking generic.

Elara's visual identity comes from disciplined operational clarity.

## Preserve product behavior

Visual work must not silently change:

- domain state
- lifecycle rules
- permissions
- approval requirements
- persistence behavior
- error recovery
- information needed for a consequential decision

If a visual problem reveals a behavioral problem, stop treating it as styling
and route it back to the appropriate product/domain authority.

## Responsive design

Mobile determines the information hierarchy.

Primary visual reference:

`405 × 720`

Regression reference:

`412 × 915`

Desktop may expand the composition, but it should not redefine the workflow.

Check long text, narrow width, wrapping, safe areas, bottom navigation, and
primary-action reachability.

Do not use fixed heights when content and padding should determine size.

## Self-critique

After implementation, review the rendered screen as a designer rather than
trusting the code.

Ask:

- Is the first thing I notice the thing that matters most?
- Is any element louder than its importance deserves?
- Can anything decorative be removed?
- Are related things visually grouped?
- Are unrelated things accidentally grouped?
- Is the screen too sparse or too dense?
- Does the interface still look coherent with realistic long content?
- Does state remain understandable without relying on color?
- Does the result still feel like Elara?

Spend visual emphasis deliberately.

One well-chosen point of emphasis is usually stronger than several competing
ones.

## Visual verification

Meaningful UI work is incomplete until the rendered result is inspected.

Verify:

- exact 9:16 mobile reference
- Android portrait regression viewport
- desktop Chromium

Inspect at minimum:

- horizontal overflow
- clipped controls
- safe-area collisions
- bottom-navigation overlap
- awkward wrapping
- vertical centering
- icon consistency
- accidental high-contrast borders
- excessive empty space
- touch-target size
- state distinction
- focus visibility

Use before/after screenshots when presentation materially changes.

A green build, lint result, or typecheck is not visual evidence.

## Completion

Frontend design is complete when:

- the hierarchy matches the operational task
- the screen follows `documents/Layout_Guide.md`
- visual choices are intentional rather than templated
- no product behavior was invented or weakened
- the UI remains useful without AI
- the mobile reference view is coherent
- responsive and accessibility basics remain intact
- screenshots confirm the rendered result

Elara should be quiet when nothing needs attention and extremely clear when
something does.

---

Adaptation source: Anthropic's `frontend-design` skill from
`anthropics/skills`, reviewed under its Apache-2.0 license. This Elara version
is rewritten for the repository's operational application context rather than
vendoring the upstream text.
