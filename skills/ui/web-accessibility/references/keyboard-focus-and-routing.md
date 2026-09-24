# Keyboard, Focus, and Route Changes

Keyboard behavior is part of the interaction contract.

Do not treat it as an implementation detail added after the UI works with a
pointer.

## Baseline

All required functionality must remain operable without a pointer.

Preserve logical DOM order.

Avoid positive `tabindex`.

Every focusable control needs a visible focus indicator.

Test both:

- Tab
- Shift+Tab

Focus must not disappear behind:

- top bars
- bottom navigation
- sheets
- dialogs
- sticky controls
- virtual-keyboard layout changes

## Focus movement

Move focus only when it helps the next task.

Before moving focus, ask:

- What changed?
- What should the operator do next?
- Would moving focus destroy context?
- Would retaining focus leave the operator stranded?

Do not move focus merely because a component rendered.

## Dialogs and sheets

A true modal interaction needs:

- logical initial focus
- focus containment while modal
- a clear escape/close path
- logical focus restoration

Do not trap focus in a non-modal panel.

When closing Capture or another sheet, return focus to the triggering control
when that remains the logical origin.

## Route changes

For SPA navigation consider:

- page title
- main heading/context
- focus destination
- browser history
- Back/Forward
- deep link entry
- validation failure
- preserved state

Do not use one universal focus target for every route.

For example, entering Repair detail from Search may need different context
preservation than navigating there from Repairs.

## Bottom navigation

Elara's mobile bottom navigation must remain keyboard reachable and must not
obscure focused content.

The current destination should be exposed semantically, not only by color.

Focus order should follow the user's reading/task order rather than visual
position hacks.

## Menus and disclosures

Use the keyboard model appropriate to the actual pattern.

Ordinary site/app navigation links do not become an ARIA menu simply because
they are visually grouped.

Disclosure controls need:

- keyboard activation
- correct expanded state
- reachable revealed content

## Manual protocol

For each relevant task, complete it with keyboard alone.

Use:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- arrow keys where the chosen pattern requires them
- Home/End where the chosen pattern requires them

Record:

- focus order
- visible focus
- traps
- unreachable controls
- incorrect restoration
- focus hidden behind fixed UI
- failure-state recovery

## Completion

Keyboard/focus behavior is acceptable when:

- all required actions are reachable
- focus is visible
- focus order is logical
- overlays handle entry/exit correctly
- route changes preserve useful context
- no fixed UI obscures the focused element
