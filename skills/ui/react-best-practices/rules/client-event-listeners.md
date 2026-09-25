---
title: "Deduplicate Global Browser Listeners"
impact: "medium"
---

# Deduplicate Global Browser Listeners

Repeated component instances should not each attach equivalent global listeners
when one shared listener can safely serve them.

Watch:

- `window`
- `document`
- resize
- visibility
- keyboard shortcuts
- online/offline events

## Do not add SWR for this

The upstream rule uses SWR subscription helpers.

Elara does not currently use SWR.

Do not add a data library merely to share an event listener.

Prefer a small existing app-level hook/provider or a dedicated shared
subscription only when repeated listeners are a measured problem.

## Cleanup

Every listener must be removed when its owner is disposed.

Keep handler identity stable enough for correct cleanup.

## Keyboard shortcuts

For global shortcuts:

- do not hijack ordinary text input
- account for platform modifier differences
- keep the underlying action accessible without the shortcut
- avoid conflicts with browser/assistive-technology commands

## Completion

Deduplicate only when listener count or behavior justifies it.

One clear local listener is often better than a global abstraction.
