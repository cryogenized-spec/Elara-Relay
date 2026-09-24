---
title: "Use Browser Rendering Deferral for Long Lists When It Helps"
impact: "medium"
---

# Use Browser Rendering Deferral for Long Lists When It Helps

For long rendered lists, `content-visibility: auto` can let the browser skip
layout and paint work for off-screen content.

Example:

```css
.operational-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
}
```

## Good candidates

Potential Elara targets include genuinely long:

- Search results
- Timeline/Event histories
- completed Task lists
- archival operational lists

## Do not use blindly

Check:

- browser behavior
- scrolling
- focus
- anchor navigation
- measured rendering cost

For smaller lists, ordinary rendering is simpler.

For very large interactive collections, virtualization may be more appropriate.

## Accessibility

Off-screen rendering optimization must not break:

- keyboard navigation
- focus visibility
- find-in-page expectations where relevant
- assistive-technology access

Test the actual supported behavior.

## Intrinsic size

Use a realistic intrinsic-size estimate to reduce scrollbar and layout jumps.

Do not copy a fixed row height if Elara rows vary substantially because of long
operational text.

## Completion

Use `content-visibility` when profiling shows long-list rendering cost and the
optimization preserves navigation, focus, layout stability, and semantics.
