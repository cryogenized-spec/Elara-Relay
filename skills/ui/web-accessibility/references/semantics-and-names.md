# Semantics, Names, and Dynamic Updates

Use HTML that represents what the interface actually is.

Native semantics reduce custom behavior and make Elara easier to operate with
keyboard and assistive technology.

## Structure

Use:

- headings for sections
- lists for lists
- links for navigation
- buttons for actions
- labels for form controls
- tables for genuinely tabular data

Do not use semantic elements merely for styling.

Keep DOM order meaningful even when CSS changes the visual arrangement.

Provide a skip or bypass mechanism when repeated application chrome creates a
real keyboard burden.

## Controls and names

Every interactive control needs an understandable name.

Prefer visible labels.

Icon-only controls require a descriptive accessible name.

A tooltip or placeholder is not a durable substitute for a label.

Keep visible label wording reflected in the accessible name where speech input
may depend on it.

Do not add redundant ARIA to a native element that already exposes the correct
role and state.

## Elara icon controls

Elara uses Iconify.

For decorative icons:

- hide them from assistive technology

For icon-only actions:

- give the control an accessible name
- make the name describe the action, not the glyph

Examples:

- Search
- Open navigation
- Capture
- Close
- More actions

Do not use names such as `magnifier` or `plus icon`.

## Tables and dense data

Use a table when rows and columns have meaningful relationships.

For simple data tables:

- identify headers
- use appropriate header cells
- use `scope` where sufficient

Do not force list-style mobile layouts into table semantics when the content no
longer behaves as a table.

If a dense desktop table becomes grouped rows on mobile, verify that the reading
order and labels remain understandable.

## Images

Decorative images use an empty alt value.

Informative images need equivalent useful information.

Do not describe file names or appearance when the meaningful information is the
image's purpose or content.

Elara should avoid unnecessary decorative imagery in operational screens.

## Names and descriptions

Accessible name and description are different concepts.

Prefer:

1. native labeling
2. visible instructions
3. targeted ARIA only where needed

For difficult naming cases, inspect the computed accessibility tree rather than
using a memorized priority shortcut.

Verify:

- references resolve
- names are not empty
- hidden content contributes only when intended
- duplicated text does not produce confusing names

## Status and dynamic updates

Do not move focus for every update.

When background state changes without requiring immediate user action, prefer an
appropriate status announcement.

Examples may include:

- save succeeded
- save failed
- validation appeared
- search results updated
- scheduled action state changed

Use assertive interruption only when the urgency genuinely requires it.

## Route and screen changes

For significant SPA navigation, consider:

- document title
- main heading/context
- focus destination
- history behavior

Do not force one universal focus target for every route.

Choose the destination that helps the next task.

## State communication

A control or object state should remain understandable without visual inference.

Examples:

- selected
- expanded
- disabled
- checked
- busy
- current
- invalid

Expose only state that is true.

Do not use ARIA to make an invalid interaction model appear valid.

## Review questions

Ask:

- Can the operator identify the page/surface structure without sight?
- Does each control expose the intended role and name?
- Does state remain understandable without color alone?
- Does dynamic feedback arrive without stealing context unnecessarily?
- Does the accessibility tree match the visible task?

Use browser accessibility-tree inspection for ambiguous cases.
