---
name: "elara-better-icons"
description: "Choose, verify, and integrate icons for Elara Relay using Iconify. Use when adding, replacing, reviewing, or standardizing interface icons."
---

# Elara Relay — Better Icons

Use Iconify for Elara interface icons.

Preferred family:

`solar`

Do not introduce Lucide.

## Read first

Before icon work, read:

- `documents/Layout_Guide.md`
- the affected UI implementation

If the task changes visible presentation, also use:

- `skills/ui/frontend-design/SKILL.md`

## Existing dependency rule

Do not assume an Iconify runtime package is already installed.

Check `package.json` and the existing UI implementation first.

If a new dependency is required, treat that as a separate dependency change and
follow the repository's approval and supply-chain rules.

Do not install a global icon CLI or add a package merely because this skill was
loaded.

## Selection order

Use this preference order:

1. Solar icon that clearly matches the concept
2. another Solar variant that better matches the existing stroke/fill style
3. a visually compatible Iconify collection only when Solar lacks the concept
4. a custom SVG only when no suitable approved library icon exists

Do not switch libraries merely because another glyph looks slightly more
interesting.

Consistency across the screen matters more than isolated novelty.

## Search by meaning

Choose icons by the action or state they communicate.

Search concepts such as:

- search
- capture
- task
- repair
- schedule
- calendar
- pause
- retry
- warning
- ready
- customer
- history

Do not search only by the visual shape you imagine.

The icon's semantic fit comes before decoration.

## Better Icons tooling

The upstream Better Icons project can search Iconify collections through its CLI
or MCP tooling.

If that tooling is available in the current environment, useful operations
include:

- search by concept
- restrict search to `solar`
- inspect alternatives
- retrieve the exact Iconify ID
- compare visually related icons

Do not add Better Icons itself as an Elara runtime dependency.

It is optional design/development tooling.

## Icon IDs

Use explicit Iconify IDs.

Example form:

`solar:<icon-name>`

Prefer stable, readable IDs over locally invented aliases unless the codebase
already has a deliberate icon abstraction.

Do not create a second icon registry without first checking the existing UI
authority.

## Visual consistency

Within one screen, keep consistent:

- family
- outline/fill treatment
- optical weight
- sizing
- alignment
- color behavior

Follow the Layout Guide:

- navigation glyph: approximately 20–22 px
- compact inline glyph: approximately 16–18 px
- larger empty-state glyph: approximately 28–36 px

These are visual glyph sizes, not touch-target sizes.

## Touch targets

The icon is not the touch target.

Primary mobile controls should generally provide approximately 44 × 44 CSS
pixels of interactive area even when the glyph is much smaller.

Do not enlarge the glyph merely to satisfy the target-size requirement.

## Color

Icons should normally inherit text or semantic state color.

Do not assign decorative colors to ordinary icons.

Status icons may use semantic color, but status must remain understandable
through text or another non-color cue.

## Accessibility

Decorative icons should be hidden from assistive technology.

Icon-only buttons require an accessible name on the control.

Name the action, not the picture.

Prefer:

- `aria-label="Search"`
- `aria-label="Capture"`
- `aria-label="Close"`

Avoid:

- `aria-label="Magnifying glass"`
- `aria-label="Plus icon"`

If the control already has visible text, avoid redundant icon announcement.

## Avoid icon backplates

Do not put every icon inside:

- a circle
- a rounded square
- a colored badge

Use a backplate only when it communicates a real grouping, action, or state.

Elara's visual identity should come from restrained consistency, not decorative
icon containers.

## Do not hand-draw casually

Do not generate a custom SVG for a concept that already exists in the approved
Iconify family.

Custom SVGs introduce:

- inconsistent stroke treatment
- inconsistent view boxes
- alignment drift
- unnecessary maintenance

When a custom icon is genuinely required, document why no suitable library icon
exists and verify it at the actual rendered sizes.

## Review

For meaningful icon changes, inspect the rendered UI.

Check:

- optical centering
- baseline alignment with text
- consistency with neighboring icons
- state color
- touch target
- accessible name
- 405 × 720 appearance
- 412 × 915 Android appearance

Do not judge icon alignment from source code alone.

## Completion

Icon work is complete when:

- the concept is immediately understandable
- Solar was preferred where suitable
- no Lucide dependency or glyph was introduced
- size and optical weight match the surrounding UI
- interactive icons have correct touch targets
- accessibility treatment is correct
- rendered alignment has been inspected

---

Adapted for Elara Relay from Better Auth's MIT-licensed `better-icons` skill.

The upstream CLI/MCP is optional development tooling; Iconify remains the
product icon system.
