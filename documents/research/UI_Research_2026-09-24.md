# UI Research — 2026-09-24

**Purpose:** Establish an authoritative research base for Elara's mobile UI direction.

This research intentionally favors primary or project-owned sources rather than
third-party design commentary.

## Vercel Web Interface Guidelines

Source: https://vercel.com/design/guidelines

Useful findings adopted by Elara:

- visible and unobscured focus treatment
- 44 px minimum mobile hit targets
- 16 px minimum mobile input text
- safe-area awareness
- no disabling browser zoom
- stable loading states
- destructive confirmation or undo
- motion that honors `prefers-reduced-motion`
- deliberate alignment and optical correction
- crisp borders plus restrained layered shadows
- nested/concentric radii
- stronger interaction contrast on hover/active/focus
- dark `color-scheme` and matching browser theme color
- all content states designed, including empty/error/dense
- status meaning not conveyed by color alone
- concise action-oriented copy

These reinforce a compact professional instrument rather than an ornamental mobile
dashboard.

## Supabase Design System

Primary sources:

- https://supabase.com/design-system
- https://supabase.com/design-system/docs/theming
- https://supabase.com/design-system/docs/color-usage
- https://supabase.com/design-system/docs/ui-patterns/layout

Useful findings adopted by Elara:

- tokenized theming rather than hard-coded component colors
- native support for light/dark/system concepts, with Elara choosing dark-first
- accessible contrast defaults
- sparse use of accent/warning/destructive colors
- layout width chosen by content need
- consistent page chrome and section structure
- reusable patterns over one-off component inventions

Supabase's public design discussion also emphasizes timelessness, "less is more",
subtlety, and restrained brand green. Elara adopts the restraint, not the brand copy.

## Iconify

Primary sources:

- https://github.com/iconify/iconify
- https://iconify.design/docs/iconify-icon/

Useful findings adopted by Elara:

- one icon interface across many open icon sets
- SVG rendering rather than icon fonts
- support for framework-neutral `iconify-icon`
- current Iconify repository guidance favors the web component path
- React can use the typed wrapper `@iconify-icon/react`
- monotone icons inherit `currentColor`, which fits tokenized dark theming

### Elara decision

The product UI will use Iconify and will **not use Lucide**.

The default visual family is Phosphor through the `ph:` namespace. A single family
is preferred for consistency. Missing domain-specific glyphs should become a small
local Iconify collection before mixing arbitrary third-party families.

## Resulting direction

The combined research points toward:

- dark-first surfaces
- thin crisp borders
- low saturation except for meaningful status/CTA accents
- compact information hierarchy
- strong typography
- 44 px touch affordances
- sparse, consistent outline icons
- safe-area-aware 9:16 mobile composition
- high-quality interaction/error/loading states
- minimal decorative motion
- responsive enhancement rather than desktop-first shrink-down

These findings are encoded into `../Layout_Guide.md`.
