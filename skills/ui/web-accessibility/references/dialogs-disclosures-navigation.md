# Dialogs, Disclosures, and Navigation

Use the simplest interaction pattern that matches the task.

Do not add menu/dialog semantics merely because a component looks like one.

## Modal dialogs

Prefer native `dialog` with `showModal()` when it fits the supported
environment.

A modal needs:

- an accessible name
- a visible close path
- logical initial focus
- focus containment while modal
- background content unavailable for interaction
- logical focus restoration

Do not create a fake modal that visually overlays the app while keyboard users
can still tab through the background.

## Initial focus

Initial focus depends on the task.

It is not always the first button.

Consider:

- whether explanatory content must be read first
- whether the first action is destructive
- whether the dialog opens near the bottom of a mobile viewport
- whether focusing an input immediately opens the mobile keyboard
- whether the user is expected to review before acting

Avoid automatic mobile keyboard opening unless it clearly helps.

## Closing

Define how the modal closes.

Possible mechanisms include:

- visible close button
- Escape
- explicit Cancel
- completing the action
- light dismiss where the task safely permits it

Do not make outside-click dismissal the only exit.

Return focus to the invoker unless:

- the invoker no longer exists
- completion moved the user into a new task
- another focus target is more logical

## Capture sheet

Elara's Capture surface is a bottom-sheet interaction.

Accessibility behavior should include:

- clear sheet name/purpose
- focus moved into the sheet when appropriate
- background interaction unavailable if the sheet is modal
- keyboard-operable close path
- logical focus return
- no focus hidden behind bottom navigation or the virtual keyboard

If the sheet becomes non-modal in a future design, do not keep `aria-modal`
semantics.

## Disclosures

Use a button to control disclosure.

Expose expanded/collapsed state accurately.

The revealed region should remain reachable in normal reading/focus order.

Use `aria-controls` only when it adds useful relationship information.

Do not use a disclosure to hide content required to understand consequence,
status, approval, or recovery.

## Primary navigation

Elara's Today / Work / Repairs / Schedule navigation is ordinary application
navigation.

Use links or router links with normal navigation semantics.

Expose the current destination with appropriate semantics such as
`aria-current` when applicable.

Do not turn primary navigation into an ARIA `menu` merely because it is a
compact mobile bar.

## Hamburger / compact navigation

If responsive UI introduces collapsible navigation:

- use a button trigger
- expose expanded state
- keep links as links
- manage focus sensibly
- make dismissal possible by keyboard

Do not require pointer-only outside click to close.

## Application menus

Use `menu` / `menuitem` semantics only when the interaction truly behaves
like an application menu.

If using that pattern, implement its expected keyboard behavior rather than
adding roles to an ordinary list of links.

## Target size

Primary mobile navigation and dialog/sheet controls should follow Elara's
approximately 44 × 44 CSS pixel product target.

Do not shrink controls to a smaller standards minimum merely because the
minimum might technically pass.

## Review questions

Ask:

- Is the interaction actually modal?
- Can keyboard users enter and exit?
- Is background content correctly unavailable while modal?
- Is focus restored logically?
- Is current navigation state exposed without color alone?
- Are ordinary links still links?
- Can a disclosure be understood and operated without visual inference?
