# Composite Widgets

Custom widgets such as tabs, comboboxes, listboxes, grids, trees, toolbars,
sliders, radio groups, and application menus require a complete interaction
contract.

Do not introduce them casually.

## Decision path

Before building a custom composite:

1. Can a native element solve the task?
2. Can an ordinary disclosure, list, select, or group solve it?
3. Is there a maintained component that already implements the needed behavior?
4. If custom behavior is necessary, define and test the whole keyboard/focus
   contract.

Use WAI-ARIA Authoring Practices as informative pattern guidance, not as proof
that a custom widget is automatically production-ready.

## Tabs

Define:

- tablist
- named tab controls
- selected state
- tabpanel relationship
- keyboard movement
- focus model
- manual versus automatic activation

Do not create tabs merely to compress content.

For mobile Elara screens, first ask whether stacked sections or a disclosure
would preserve more context with less interaction cost.

## Comboboxes

Define:

- accessible name
- current input/value
- expanded state
- popup relationship
- filtering behavior
- option focus/selection model
- Escape/close behavior
- commit behavior

Do not use a custom combobox when a native select or searchable input/list
combination satisfies the task more reliably.

## Listboxes

Use listbox semantics only when the interaction actually behaves as a listbox.

Define:

- label
- options
- single or multiple selection
- active option
- arrow behavior
- type-ahead where useful
- entry/exit behavior

Do not use listbox roles for ordinary navigation links or a group of checkboxes.

## Application menus

Use application-menu semantics only when the interaction has true menu
behavior.

Ordinary Today / Work / Repairs / Schedule navigation is not an ARIA menu.

If a menu pattern is chosen, define:

- menu button
- expanded state
- focus entry
- arrow-key movement
- Escape
- activation
- focus return

## Grids and tree views

Dense interactive grids and trees create significant complexity.

Before adopting one, ask whether Elara's task actually needs:

- two-dimensional navigation
- hierarchical expansion
- inline editing
- multi-selection

If not, prefer a simpler list/table/detail interaction.

If a grid/tree is necessary, define:

- item/row structure
- focus versus selection
- directional navigation
- editing mode
- announcements
- practical fallback

## Keyboard model

Do not make every descendant a Tab stop when the chosen pattern expects a
single roving Tab stop plus arrow-key movement.

Do not mix keyboard models from different widgets.

Account for orientation and writing direction where relevant.

## ARIA discipline

Do not mix roles from unrelated patterns.

Do not add roles only to obtain styling hooks.

Valid ARIA attributes do not prove the widget is usable.

Inspect the accessibility tree and test the actual task.

## Elara design constraint

Complex widgets must justify their cognitive and mobile cost.

Elara favors compact operational clarity, not interaction novelty.

If the same workflow can be implemented with native controls and ordinary
navigation, prefer the simpler solution.

## Completion

A composite widget is acceptable when:

- its pattern is justified
- role/name/state relationships are correct
- keyboard behavior is complete
- focus behavior is coherent
- touch/pointer behavior matches the keyboard model
- disabled/error states are defined
- the supported browser/AT environment has been tested
