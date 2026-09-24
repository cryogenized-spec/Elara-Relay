# Elara Relay — Layout Guide

Status: **Canonical interface direction**  
Research snapshot: **2026-09-24**  
Primary target: **mobile, dark mode, portrait-first**

## 1. Visual thesis

Elara should feel like a serious operations instrument rather than a generic productivity template.

The target character is:

- **crisp, quiet, dense enough to be useful, never cluttered**;
- dark-first with excellent contrast;
- strong geometry, restrained radius, subtle layering;
- status color used as information, not decoration;
- excellent typography and spacing doing more work than shadows or gradients;
- mobile-first composition with desktop expansion rather than desktop shrinkage.

The visual benchmark is the restraint seen in Vercel's Geist system and Supabase's product/design system, without copying either brand. Vercel's official system explicitly separates backgrounds, component backgrounds, borders, high-contrast surfaces, and primary/secondary text/icon colors; its typography system also defines compact dashboard-oriented copy and label scales. Supabase's official design system similarly treats layout, navigation, forms, theming, and composed UI patterns as system-level concerns, with first-class dark-mode support.

Elara should borrow the **discipline**, not the branding.

## 2. Research basis

Authoritative references used for this guide:

- Vercel Geist introduction: https://vercel.com/geist/introduction
- Vercel Geist colors: https://vercel.com/geist/colors
- Vercel Geist typography: https://vercel.com/geist/typography
- Supabase Design System: https://supabase.com/design-system
- Supabase UI patterns: https://supabase.com/design-system/docs/ui-patterns/introduction
- Supabase theming: https://supabase.com/design-system/docs/theming
- Iconify React documentation: https://iconify.design/docs/icon-components/react/
- Iconify icon data documentation: https://iconify.design/docs/icons/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WCAG non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- WCAG target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- Android compact navigation guidance: https://developer.android.com/develop/ui/compose/components/navigation-bar
- Android layout/navigation patterns: https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns

These are design inputs, not dependencies. Elara keeps its own tokens and components.

## 3. Primary viewport strategy

### Visual design target

Compose primary mobile screens for a **9:16 portrait frame**.

A 9:16 mockup is the design target because it exposes hierarchy, thumb reach, information density, and vertical rhythm clearly.

### Certification viewport

The existing canonical Playwright mobile viewport remains **412 × 915**. It is narrower/taller than exact 9:16 and is therefore a useful stress case.

Rules:

- no screen may require an exact aspect ratio;
- no critical control may depend on fixed viewport height;
- sticky/fixed UI must respect `env(safe-area-inset-*)`;
- layouts must remain usable down to roughly 360 CSS px width;
- desktop is an expansion mode, not the source layout.

## 4. Surface model

Use a small number of deliberate dark surfaces.

Suggested starting tokens:

```css
--canvas: #07090b;
--surface-1: #0c0f12;
--surface-2: #11151a;
--surface-3: #171c22;

--border-subtle: #252a31;
--border-strong: #556170;

--text-primary: #f4f7f8;
--text-secondary: #a8b0ba;
--text-tertiary: #7c8794;

--accent: #4ed6a0;
--info: #6caaf4;
--warning: #f0b45a;
--danger: #f06a6a;
```

The exact values can move after visual testing, but the semantic structure should not.

Important distinction:

- `border-subtle` is ornamental separation;
- `border-strong` is for controls, focus-adjacent state, and boundaries that must remain visually identifiable.

Avoid pure black everywhere. Slightly lifted neutral surfaces preserve depth without glossy effects.

## 5. Color behavior

Color is semantic.

Use green/emerald for success, ready, healthy, connected, or confirmed states. Use amber for waiting, stale, due-soon, or attention. Use red for destructive, failed, blocked, expired, or invalid. Use blue sparingly for neutral informational emphasis.

Never make status understandable by hue alone. Pair color with:

- text;
- an Iconify icon;
- a shape, label, or state word where appropriate.

Do not paint whole cards green/red unless the entire card is an alert surface. Prefer a status dot, left rule, icon, badge, or compact tint.

No rainbow dashboards.

## 6. Typography

Preferred family:

- **Geist Sans** for interface copy;
- **Geist Mono** for IDs, timestamps, job keys, revisions, technical metadata;
- system fallbacks if Geist is not loaded.

The choice is consistent with the visual benchmark while keeping Elara's hierarchy independent.

Recommended mobile scale:

| Role | Size | Weight | Notes |
| --- | ---: | ---: | --- |
| Page title | 24–28 px | 600 | One line where practical |
| Section title | 16–18 px | 600 | Compact |
| Primary body | 14 px | 400–500 | Default working text |
| Secondary body | 13 px | 400 | Dense supporting content |
| Label | 12–13 px | 500–600 | Short metadata |
| Mono metadata | 12–13 px | 450–500 | IDs, times, keys |

Do not use tiny 10 px dashboard text as a density shortcut.

Line-height should remain generous enough to scan quickly: roughly 1.35–1.5 for normal body copy.

## 7. Spacing and rhythm

Use a 4 px base grid.

Preferred spacing steps:

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40`

Mobile page gutter: **16 px**.  
Dense internal control spacing: **8–12 px**.  
Section spacing: **20–32 px**.

A screen should feel aligned even before borders are visible.

Do not stack arbitrary margins. Components should own internal spacing; layouts should own gaps between components.

## 8. Radius, borders, shadows

The product should not look like a field of oversized rounded cards.

Default radius guidance:

- controls: 8 px;
- cards/panels: 10–12 px;
- pills/badges: fully rounded only when semantically appropriate;
- large modal/sheet surfaces: 14–16 px maximum.

Use 1 px borders heavily and shadows lightly.

Preferred depth order:

1. background difference;
2. border;
3. subtle shadow only where elevation materially helps.

Avoid glassmorphism, blurred translucent panes, neon glows, and large gradients as default UI language.

## 9. Icon system — Iconify only

**Do not use Lucide or `lucide-react`.**

Iconify is the required icon source. Its official React tooling renders SVG and supports hundreds of open icon sets.

### Primary family

Use one primary family for almost all product UI:

- **Phosphor regular via Iconify (`ph:*`)** as the default.

Why: clean geometry, good optical weight at mobile sizes, broad semantic coverage, and enough personality without becoming illustrative.

Exceptions should be rare and documented.

### Rendering rules

- normal navigation/action icon: 20 px;
- compact inline/status icon: 16–18 px;
- prominent empty-state icon: 24–32 px;
- icon-only buttons still need a minimum **44 × 44 px** interaction box;
- align icons optically, not merely by SVG box;
- monotone icons inherit current text color.

### Performance rule

Do not make production navigation depend on a remote icon fetch.

Iconify's own documentation notes that on-demand loading can introduce a short render delay. Critical icons should therefore be bundled/localized through Iconify-supported local data/import methods so the first paint is stable.

### Icon usage

An icon must clarify one of:

- navigation;
- action;
- state;
- entity type;
- severity.

Do not add icons to every text label purely as decoration.

## 10. Navigation architecture

Mobile navigation should prioritize the actual operational model.

Primary destinations:

1. **Today**
2. **Work**
3. **Repairs**
4. **Schedule**
5. **Search**

Use a sticky bottom navigation on mobile. Android's current Material guidance
recommends a navigation bar for three to five destinations on compact screens,
which fits Elara's five primary destinations cleanly. Keep labels visible where
space permits and always on the active destination; do not rely on icon memory
alone.

Global Capture remains persistently reachable without becoming a sixth crowded tab. Recommended treatment:

- compact floating `+` action above the bottom navigation, or
- a persistent high-reach action in the mobile header if testing shows better ergonomics.

The final placement should be decided with 412 × 915 screenshots and one-handed-use testing.

Desktop/tablet may promote the same destinations into a narrow left rail.
This follows the same adaptive pattern Android recommends when moving from
compact to larger windows rather than stretching a bottom bar across wide
screens.

## 11. Top bar

Mobile top bar should be visually quiet.

Recommended anatomy:

- left: current section/page identity;
- right: context actions such as Capture, filters, overflow, or account;
- optional second row only when the page needs search/filter controls.

Do not permanently reserve vertical space for decorative product status text.

System health belongs in a compact status surface, settings, or an intentional diagnostics view—not as noisy chrome on every screen.

## 12. Core screen patterns

### Today

Today is the operational home screen.

Order information by required attention, not entity type:

1. overdue/failed;
2. due now;
3. waiting/follow-up;
4. ready for collection;
5. scheduled actions due;
6. lower-priority upcoming context.

Prefer grouped rows and compact panels over large cards.

Every row should answer:

- what is this?
- why is it here?
- what is the next meaningful action?

### Work

Work is the general Jobs/Tasks surface.

Default to list/section views, not a generic Kanban board. Kanban may exist later as an alternate lens, but it does not define the information architecture.

### Repairs

Repairs should feel stage-aware.

Each repair view should expose:

- job/customer identity;
- reported fault;
- current stage;
- current finding/diagnosis;
- serial state;
- waiting reason/follow-up when relevant;
- final test state;
- timeline.

Stage transitions should be obvious but not dominate the whole screen.

### Schedule

Schedule needs three lenses:

- Due / attention;
- Upcoming;
- Recurring.

Execution-ledger internals remain hidden from normal users unless diagnostics are explicitly opened.

### Search

Search is universal and fast.

Searchable concepts include:

- party/customer;
- job key;
- task title;
- repair fault/finding;
- serial;
- storage location;
- scheduled action;
- relevant event text.

Search results should group by entity type while preserving one global query.

### Job / Repair detail

Use a strong information hierarchy:

1. identity and current state;
2. next action;
3. critical metadata;
4. task/repair/schedule context;
5. timeline/history.

Timeline is the durable history surface. Notes are current context, not a substitute for history.

## 13. Cards, rows, and density

Default to **rows with separators** when the user is scanning multiple records.

Use cards when a unit has meaningful internal structure or needs to stand apart from surrounding content.

A good mobile card typically has:

- one primary line;
- one secondary line;
- compact metadata;
- one state marker;
- optional trailing action.

Avoid nested cards.

## 14. Buttons and actions

Action hierarchy:

- primary: one per immediate decision surface;
- secondary: neutral bordered/quiet button;
- tertiary: text/icon action;
- destructive: red only when consequence is genuinely destructive.

Mobile controls should target **44 × 44 px** where practical. WCAG 2.2 AA defines a 24 × 24 CSS px minimum target with spacing exceptions; Elara intentionally aims higher for touch ergonomics.

Destructive actions require explicit wording. Avoid ambiguous labels such as `OK`.

## 15. Accessibility floor

Elara targets at least WCAG 2.2 AA behavior for the product UI.

Required:

- normal text contrast of at least 4.5:1;
- important non-text UI/state visuals at least 3:1 against adjacent colors;
- visible keyboard focus;
- touch/pointer targets at least 24 × 24 CSS px minimum, with **44 × 44 px preferred**;
- no state conveyed by color alone;
- semantic labels for icon-only controls;
- reduced-motion support for non-essential animation;
- proper heading/landmark hierarchy;
- sheets/modals restore focus correctly.

Accessibility is part of visual quality, not a cleanup pass.

## 16. Motion

Motion should communicate causality.

Good uses:

- sheet/drawer entry;
- item completion/reordering;
- refresh state;
- loading transition;
- short status change.

Durations should generally stay around 120–220 ms.

Avoid continuous ambient animation in operational screens.

## 17. Loading and state feedback

Never leave the user wondering whether a tap registered.

Use:

- inline spinner for a button-specific operation;
- skeleton only for content whose shape is known;
- compact progress state for longer work;
- optimistic updates only where conflict semantics are safe;
- explicit stale/error states when freshness matters.

Authentication refresh, scheduler actions, and external integrations must show a visible transient state instead of silently hanging.

## 18. Empty states

Empty states should be useful, not cute.

Structure:

- small Iconify icon;
- concise state title;
- one sentence explaining why this matters;
- one primary action where appropriate.

Example:

**No repairs waiting**  
Nothing currently needs parts or customer follow-up.

Do not use giant illustrations in operational empty states.

## 19. Responsive behavior

At tablet/desktop widths:

- bottom navigation becomes a left rail;
- content may use a master/detail split;
- Today can become a two-column attention + upcoming layout;
- search results may retain grouped columns;
- side sheets can replace full-screen mobile detail transitions.

Do not simply stretch mobile cards to 1200 px wide.

Content max-widths should be intentional per screen.

## 20. Visual evidence gate

Every material UI change should be checked at minimum in:

- canonical Android portrait: **412 × 915**;
- exact or near **9:16** visual target;
- desktop Chromium.

Before/after screenshots should be treated as review evidence for alignment, density, clipping, safe-area behavior, and icon rendering.

A green unit-test suite does not prove a screen looks correct.

## 21. Anti-patterns

Reject the following unless a specific screen justifies them:

- Lucide imports;
- generic SaaS dashboard card grids;
- heavy gradients;
- excessive glow;
- glass panes;
- 20+ px card radii everywhere;
- large hero headings inside operational screens;
- unlabeled icon-only navigation;
- status encoded only by color;
- tiny tap targets;
- hidden horizontal scrolling;
- permanent debug/status chrome;
- AI-first interaction replacing usable manual controls.

## 22. Definition of visual success

A finished Elara screen should look credible beside Vercel or Supabase without looking copied.

It should feel:

**quiet at first glance, information-rich on inspection, fast under the thumb, and precise under pressure.**
