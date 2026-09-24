# Elara Relay — Layout Guide

**Status:** Canonical visual-direction baseline  
**Established:** 2026-09-24 19:54 SAST  
**Primary surface:** Mobile portrait  
**Primary design frame:** 360 × 640 px (9:16)  
**Secondary certification frame:** 412 × 915 px Android portrait  
**Theme:** Dark-first  
**Icon system:** Iconify — no Lucide icons

## 1. Design thesis

Elara should feel like a calm professional instrument: precise, quiet, fast, and
trustworthy. The visual reference is the restraint of Vercel combined with the dense,
tool-like clarity of Supabase Studio.

The goal is **not** to clone either product. The goal is to inherit the useful
characteristics:

- crisp 1 px borders instead of decorative chrome
- strong typographic hierarchy
- low-noise dark surfaces
- restrained use of accent color
- deliberate spacing and alignment
- information-dense screens that still breathe
- fast, obvious interaction states
- almost no ornamental gradients
- no oversized marketing-style cards inside the operational app

Supabase's own design principles emphasize subtlety, simplification, and restrained
brand color. Vercel's interface guidance emphasizes crisp borders, layered shadows,
nested radii, strong focus states, safe-area handling, and generous mobile hit targets.

## 2. Research-backed rules

The UI implementation should treat these as hard defaults:

- Mobile interactive targets are at least **44 × 44 px**.
- Mobile text inputs use at least **16 px** text.
- Every focusable control has a visible `:focus-visible` state.
- Sticky chrome must not obscure focused elements.
- Safe-area insets are respected at top and bottom.
- Motion honors `prefers-reduced-motion`.
- Status meaning is never communicated by color alone.
- Destructive actions require confirmation or a safe undo path.
- Dark mode sets `color-scheme: dark` and the browser theme color to the app
  background.
- Loading states preserve layout and avoid spinner flicker.
- Empty, sparse, dense, error, offline, stale-auth, and loading states are designed,
  not left to browser defaults.

## 3. Device & responsive targets

### Primary mobile target

Design every core screen first at **360 × 640 px**, an exact 9:16 reference frame.

The layout must remain fully usable from **320 px to 480 px** CSS width without
horizontal scrolling.

### Certification target

The existing Android Playwright viewport remains **412 × 915 px**. A screen passing
the 9:16 design frame but failing the 412 × 915 certification frame is not complete.

### Tablet / desktop

Mobile is the product priority. Larger layouts should progressively enhance rather
than reorganize the product into a different mental model.

- under 720 px: mobile navigation
- 720–1023 px: compact rail / adaptive two-column detail where useful
- 1024 px and above: left navigation rail/sidebar may appear
- content widths remain intentional; dense operational views may use more width than
  settings/forms

## 4. App information architecture

The primary navigation is:

1. **Today** — attention surface
2. **Work** — Jobs and Tasks
3. **Repairs** — workshop workflow
4. **Schedule** — reminders and recurring actions
5. **Search** — cross-domain retrieval

A persistent **Capture** action remains reachable without navigating away from the
current work.

On narrow mobile screens, do not squeeze 6 equal nav items into one row. Prefer:

- 4 primary bottom-nav destinations
- Search in the top application bar
- persistent Capture action
- secondary destinations inside the Work/More sheet when necessary

The exact composition can be tuned during UI implementation, but no important action
may require a hidden hamburger-only workflow on the primary mobile surface.

## 5. Visual tokens

The first UI implementation should start from these tokens. Small optical changes are
allowed during screenshot review; wholesale palette drift is not.

```css
:root {
  color-scheme: dark;

  --elara-bg: #090a0c;
  --elara-bg-elevated: #0d0f12;
  --elara-surface: #111419;
  --elara-surface-hover: #161a20;
  --elara-surface-active: #1b2027;

  --elara-border-subtle: rgba(255, 255, 255, 0.07);
  --elara-border: rgba(255, 255, 255, 0.11);
  --elara-border-strong: rgba(255, 255, 255, 0.18);

  --elara-text: #f5f7fa;
  --elara-text-secondary: #a8b0bb;
  --elara-text-muted: #737d89;

  --elara-accent: #3ecf8e;
  --elara-accent-strong: #52dfa0;
  --elara-warning: #e7ad55;
  --elara-danger: #ef6673;
  --elara-info: #6b91f7;

  --elara-focus: #7ee2b8;
}
```

### Accent policy

Green is a **signal**, not wallpaper.

Use accent color for:

- primary CTA
- active navigation indicator
- positive system state
- focus emphasis where appropriate
- a small number of high-value status signals

Do not fill entire cards, headers, or backgrounds with green. Warning and destructive
colors are equally restrained.

## 6. Typography

Preferred application typography:

- **Sans:** Geist Sans when bundled locally; otherwise a high-quality system sans stack
- **Mono:** Geist Mono for IDs, job keys, timestamps, diagnostics, revisions, and
  machine-state snippets

Default scale:

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Page title | 22 px | 600 | 28 px |
| Section title | 16 px | 600 | 22 px |
| Body | 14 px | 400 | 20 px |
| Control label | 13 px | 500 | 18 px |
| Metadata | 12 px | 400 | 17 px |
| Micro/status | 11 px | 500 | 16 px |

Operational interfaces should avoid giant headings. The content is the hero.

Use tabular numerals for times, counts, pressure values, revisions, and comparable
numbers.

## 7. Spacing & geometry

Use a 4 px base unit.

```text
4   micro
8   compact
12  control interior
16  standard
20  section transition
24  major section
32  page rhythm
48  exceptional separation
```

Radii:

- controls: 6–8 px
- cards/panels: 10–12 px
- sheets/dialogs: 14–16 px
- pills only for genuine tags/statuses, not ordinary buttons

Avoid "bubble UI". Most controls should have a compact rectangular silhouette.

Borders are normally 1 px. Use layered shadow only for floating surfaces, dialogs,
menus, and sticky elements that genuinely sit above content.

## 8. Iconography — Iconify only

Elara uses **Iconify**, not Lucide.

Implementation preference: use the current Iconify web-component path through
`@iconify-icon/react`, keeping the delivery mechanism framework-light and consistent
with Iconify's current guidance.

### Primary icon family

Use **Phosphor via Iconify** (`ph:`) as the default family because its regular outline
weight reads cleanly on dark operational surfaces.

Do not casually mix icon families. If a domain-specific symbol is missing, prefer a
small local custom Iconify collection over introducing a second visual language.

Suggested semantic mapping:

| Meaning | Iconify name |
|---|---|
| Today | `ph:sun` |
| Work | `ph:check-square` |
| Repairs | `ph:wrench` |
| Schedule | `ph:calendar-dots` |
| Search | `ph:magnifying-glass` |
| Capture | `ph:plus` |
| History | `ph:clock-counter-clockwise` |
| Waiting | `ph:hourglass-medium` |
| Warning | `ph:warning` |
| Complete | `ph:check-circle` |
| Settings | `ph:gear-six` |
| User/session | `ph:user-circle` |

Icon rules:

- 18–20 px in compact controls
- 22–24 px in bottom navigation
- 16 px beside metadata
- monotone `currentColor`
- icons accompany text for ambiguous actions
- icon-only buttons require an accessible name
- active state changes contrast and/or container treatment, not icon size

## 9. Screen anatomy

### Mobile app shell

The default vertical stack is:

```text
safe area
top app bar / contextual header
optional attention summary
scrolling content
persistent capture affordance
bottom navigation
safe area
```

The content layer owns scrolling. Avoid nested full-height scroll containers unless a
sheet or drawer requires one.

### Top bar

Target height: **48–52 px** plus safe-area inset.

Use it for:

- page/context title
- search or global utility action
- concise status when operationally relevant

Do not reserve large vertical branding space. "Elara" may appear in onboarding or
empty-state identity, not as a permanent oversized masthead.

### Bottom navigation

Target visual height: **58–64 px** plus bottom safe-area inset.

Each destination gets:

- Iconify icon
- short text label
- 44 px minimum hit target
- active state using stronger contrast and a restrained indicator

## 10. Core component character

### Cards

Cards exist only when grouping materially improves comprehension. Prefer section
boundaries and dividers over wrapping every row in a rounded box.

### Lists

Operational lists are compact, scannable, and stable:

- primary label left
- state/time/priority aligned consistently
- metadata is secondary, not decorative
- row target height roughly 48–60 px
- avoid variable row padding unless content genuinely wraps

### Status

Status requires text plus a secondary cue:

`Waiting · Supplier`, `Ready · Final test passed`, `Overdue · 2 h`.

No traffic-light dots without labels.

### Forms

- labels remain visible
- validation appears next to the field
- save action names the outcome: **Create Repair**, **Save Schedule**
- never use vague **Continue** where a specific verb exists
- date/time entry always shows timezone context where ambiguity matters

### Sheets & dialogs

On mobile, prefer bottom sheets for short contextual actions and full-screen sheets for
multi-field workflows. Destructive confirmation can use a compact dialog.

## 11. Motion

Motion is subtle and functional.

Allowed defaults:

- 120–180 ms for press/hover/focus feedback
- 180–240 ms for sheets, menus, and route-adjacent transitions
- transform + opacity preferred
- no `transition: all`
- no looping decorative motion in the operational shell

Loading indicators should appear only after a short delay when possible so fast actions
do not flash spinners.

## 12. Required UI states

Every production screen must account for:

- loading
- empty
- populated
- dense/populated
- validation error
- server/network error
- unauthorized / stale session
- offline or unavailable API
- mutation conflict / stale revision
- retryable scheduler state where relevant

## 13. Visual acceptance gate

A UI PR is not visually complete until it demonstrates:

1. 360 × 640 mobile portrait
2. 412 × 915 Android portrait
3. dark mode
4. long text stress case
5. empty state
6. error/attention state where relevant
7. keyboard focus state on desktop
8. no horizontal overflow
9. safe-area correctness
10. no Lucide dependency or Lucide icon imports

Before/after screenshots should be generated for presentation-changing PRs.

## 14. Authoritative research basis

This guide was grounded in primary/authoritative sources checked on 2026-09-24:

- Vercel Web Interface Guidelines  
  https://vercel.com/design/guidelines
- Supabase Design System  
  https://supabase.com/design-system
- Supabase color usage  
  https://supabase.com/design-system/docs/color-usage
- Supabase layout patterns  
  https://supabase.com/design-system/docs/ui-patterns/layout
- Supabase theming  
  https://supabase.com/design-system/docs/theming
- Iconify monorepo and current component guidance  
  https://github.com/iconify/iconify
- Iconify Icon web component  
  https://iconify.design/docs/iconify-icon/

See `research/UI_Research_2026-09-24.md` for the research notes that informed this
baseline.
