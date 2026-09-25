# Elara Relay — Layout Guide

**Status:** Canonical UI direction  
**Primary mode:** Mobile portrait, dark-first  
**Visual target:** 9:16 portrait  
**Icon system:** Iconify only — no Lucide

## 1. Design intent

Elara should feel like a professional operational instrument rather than a
consumer productivity app.

The visual reference point is the restraint and precision associated with
modern infrastructure products such as Vercel and Supabase:

- dark, quiet surfaces
- strong typography
- thin boundaries
- disciplined spacing
- minimal decoration
- high information density without visual noise
- one clear hierarchy per screen
- color used primarily for state and attention

Elara should not imitate either product literally.

The objective is the same class of visual confidence: crisp, intentional,
technical, and calm.

## 2. Research basis

The layout direction is informed by:

- Vercel Geist — simplicity, minimalism, speed, precision, and clarity
- Supabase Design System — theme tokens, restrained surface hierarchy,
  consistent layouts, compact application chrome, and accessible contrast
- Iconify — a unified SVG icon system independent of one icon family
- WCAG 2.2 — target-size, contrast, focus, reflow, and mobile interaction
  requirements

These are design references, not dependencies on another product's branding.

## 3. Reference viewports

### Primary composition target

Use an exact 9:16 reference when making layout decisions.

Recommended canonical design frame:

`405 × 720`

This is the viewport used to judge hierarchy, vertical rhythm, density,
navigation placement, and first-screen usefulness.

### Regression viewport

The existing Android Playwright viewport:

`412 × 915`

remains an important secondary regression target until the automated visual
suite is intentionally changed.

A design is not considered mobile-complete merely because it fits a tall
modern phone. Critical actions and primary attention content should remain
coherent in the 9:16 frame.

Desktop remains supported but is not the layout authority.

## 4. Dark-first surface system

Dark mode is the primary visual language.

Use layered neutral surfaces rather than large color fills.

Suggested token hierarchy:

- Canvas: near-black
- Base surface: slightly lifted charcoal
- Raised surface: one subtle step lighter
- Hover/pressed surface: another small neutral step
- Border: low-contrast neutral hairline
- Primary text: soft near-white
- Secondary text: cool neutral grey
- Disabled text: lower-contrast grey
- Accent: one restrained Elara accent
- Success, warning, and destructive colors: reserved for actual state

Avoid:

- large gradients
- neon glow
- glassmorphism as a general surface treatment
- heavy shadows
- saturated borders around every component
- decorative color with no semantic purpose

Depth should normally come from surface contrast and borders rather than
shadow.

## 5. Typography

Use Geist Sans as the preferred interface typeface.

Use Geist Mono selectively for:

- identifiers
- Job keys
- timestamps
- technical status
- revision numbers
- system/debug metadata

Do not turn the whole interface into a terminal.

Recommended hierarchy:

- Screen title: 20–24 px, semibold
- Section title: 15–17 px, semibold
- Primary row text: 14–16 px
- Secondary/meta text: 12–14 px
- Technical labels: 11–13 px mono where useful

Prefer weight and spacing over oversized headings.

Mobile vertical space is operational real estate.

## 6. Spacing

Use a disciplined 4 px base rhythm.

Primary increments:

`4 / 8 / 12 / 16 / 20 / 24 / 32`

Recommended mobile page gutter:

`16 px`

Dense information rows may use 12 px internal spacing.

Large empty gaps should be intentional. Do not use excessive padding to make
a sparse screen look premium.

## 7. Shape language

Elara should be moderately squared, not bubbly.

Recommended radii:

- small controls: 6–8 px
- inputs/buttons: 8 px
- panels/cards: 10–12 px
- sheets/modals: 14–16 px

Avoid pill shapes except where the semantic object is actually a compact
status, filter, or tag.

Do not put every piece of information inside its own card.

Prefer grouped rows, sections, and hairline dividers.

## 8. Iconography

Use Iconify.

Do not introduce Lucide.

Preferred implementation direction:

`@iconify-icon/react`

Choose one dominant outline/linear Iconify family for the application and stay
within it wherever possible.

Recommended starting family:

`solar`

Use another Iconify collection only when the primary family genuinely lacks
the required concept.

Rules:

- standard navigation glyph: 20–22 px
- compact inline glyph: 16–18 px
- large empty-state glyph: 28–36 px
- icons inherit text/state color
- do not put every icon inside a circle
- use labels for ambiguous actions
- icon style must remain visually consistent across a screen

The icon is not the touch target.

Interactive controls should generally provide at least a 44 × 44 CSS pixel
touch area even when the visible glyph is smaller.

## 9. Primary mobile shell

The mobile shell should be extremely stable.

### Top bar

Keep it compact.

Typical contents:

- current screen title or context
- optional small secondary status
- Search action
- contextual overflow action where needed

Do not consume a large vertical block for branding.

The application name does not need to be repeated on every operational screen.

### Bottom navigation

Primary destinations:

- Today
- Work
- Repairs
- Schedule

Search is globally available from the top bar.

Capture is a persistent primary action rather than a fifth information
destination.

### Capture

The `+` Capture action opens a bottom sheet.

Initial manual capture choices:

- Task
- Repair / Job
- Reminder

Later AI capture uses the same underlying domain operations.

Capture must remain useful with AI completely disabled.

## 10. Screen direction

### Today

Today is the operational home screen.

It should answer:

"What requires my attention?"

Priority order:

1. overdue
2. due now / today
3. Repair follow-ups
4. Ready for collection
5. Waiting items that have gone stale
6. Scheduled actions
7. data-health warnings

Use compact attention rows rather than a dashboard full of decorative cards.

### Work

Work presents Jobs and Tasks.

Support:

- Active
- Waiting
- Inbox / Next
- Done when explicitly requested

A Job is the durable case.

A Task is an atomic action.

Do not visually collapse those concepts into one object.

### Repairs

Repairs are stage-oriented.

Make the stage immediately visible.

Important information near the top:

- customer / party
- Job key
- reported fault
- current finding
- serial state/value
- waiting state
- follow-up
- current Repair stage

History belongs below the current operational state.

### Schedule

Schedule emphasizes:

- due
- upcoming
- paused
- recurring

Show recurrence compactly.

Execution-ledger internals do not belong in the normal operator interface.

### Search

Search should feel closer to a command palette than a form page.

Search targets include:

- customer / Party
- Job key
- Task
- Repair
- serial
- product/model text
- waiting text
- Event detail
- Scheduled Action

Results should be grouped by entity type.

## 11. Job / Repair detail

Use one strong summary region followed by sections.

Recommended order:

- identity / current state
- primary actions
- current operational fields
- linked Tasks
- linked Scheduled Actions
- Timeline

Timeline is historical truth.

Notes or current findings are present-state information.

Do not use one giant notes field as a substitute for Events.

## 12. Status presentation

Color must never be the only status signal.

Use:

- icon
- concise text label
- restrained semantic color

Examples:

- green: successful / ready / healthy
- amber: waiting / attention
- red: destructive / failed / overdue where warranted
- neutral: ordinary inactive metadata

Do not paint entire cards bright colors for normal states.

## 13. Forms

Prefer one-column forms on mobile.

Group related fields.

Place primary action where it remains reachable without obscuring content.

Validation should be:

- inline
- specific
- close to the field
- non-destructive to entered data

Use native input semantics wherever possible.

Do not hide essential fields behind clever gestures.

## 14. Interaction and motion

Motion should communicate state, not decorate the interface.

Recommended transition range:

`120–180 ms`

Use subtle:

- fade
- translate
- collapse/expand

Avoid:

- springy overshoot
- large zooms
- parallax
- perpetual animation

Respect reduced-motion preferences.

## 15. Accessibility floor

WCAG 2.2 AA is the baseline.

Elara should voluntarily aim above the minimum where mobile ergonomics benefit.

Requirements include:

- visible keyboard focus
- meaningful non-text contrast
- no color-only status communication
- no essential drag-only operation
- sensible reflow
- minimum target spacing
- approximately 44 × 44 px touch targets for primary mobile controls
- readable text contrast on all dark surfaces

## 16. Responsive behavior

Mobile decides the information hierarchy.

Tablet and desktop may expand it.

Do not design desktop first and collapse it afterward.

Desktop adaptations may introduce:

- persistent side navigation
- multi-column detail
- wider tables
- split list/detail layouts

The underlying task flow should remain the same.

## 17. Visual certification

UI work is incomplete until visually checked.

For meaningful presentation changes, capture before/after evidence.

Required visual targets:

- exact 9:16 mobile reference
- existing Android portrait regression viewport
- desktop Chromium

Check:

- horizontal overflow
- clipped controls
- safe-area collisions
- bottom-navigation overlap
- awkward wrapping
- inconsistent icon sizing
- poor vertical centering
- accidental high-contrast borders
- oversized empty space
- inaccessible state distinction

A green typecheck is not visual proof.

## 18. Design anti-patterns

Do not:

- use Lucide
- use giant hero headers inside operational screens
- add gradients simply to make a screen feel modern
- over-cardify lists
- use pills for ordinary buttons
- hide labels behind unexplained icons
- make status colors decorative
- use fixed heights where content/padding should determine size
- create desktop-only information architecture
- let AI controls dominate core manual workflows
- expose database or scheduler implementation terminology to ordinary users

## 19. Product feeling

Elara should feel like:

an instrument panel built by people who care about details.

Quiet when nothing requires attention.

Extremely clear when something does.
