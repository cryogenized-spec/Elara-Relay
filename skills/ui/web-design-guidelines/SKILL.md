---
name: "elara-web-design-guidelines"
description: "Audit Elara Relay UI implementation after a design or interaction change. Use for code review, accessibility-oriented interface review, interaction polish, responsive review, form review, and visual-quality checks."
---

# Elara Relay — Web Design Guidelines Review

Review implemented Elara UI against the repository's interface quality rules.

This is a **review skill**, not a design-generation skill.

Use it after implementation or during review to identify concrete interface
defects without redesigning the product.

## Read first

Before reviewing UI code, read:

- `documents/Layout_Guide.md`
- `skills/ui/frontend-design/SKILL.md`
- `references/interface-guidelines.md` in this skill directory

Read the affected source files and relevant tests before issuing findings.

Do not fetch external guidelines during an ordinary review. The checked-in
reference is the reviewed Elara baseline.

## Review boundary

This skill may identify:

- interaction defects
- accessibility defects
- focus problems
- form problems
- responsive/layout defects
- unsafe or misleading feedback
- content-handling failures
- dark-mode/theming problems
- avoidable performance hazards
- visual implementation anti-patterns

It must not silently redefine:

- domain lifecycle
- permissions
- mutation semantics
- approval boundaries
- scheduler behavior
- persistence behavior

If a UI defect is caused by missing product/domain behavior, report that
boundary instead of inventing a frontend workaround.

## Method

1. Identify the files and visible surface under review.
2. Read the local guideline reference.
3. Apply only rules relevant to the affected code and behavior.
4. Distinguish definite defects from context-dependent concerns.
5. Prefer concrete evidence from source, tests, and rendered UI.
6. For meaningful presentation changes, inspect Playwright screenshots or the
   rendered result.
7. Report findings in concise `file:line` form where line evidence exists.

Do not create noise by listing irrelevant rules that already pass.

## Severity

Use:

- **BLOCKER** — unsafe, inaccessible, misleading, or breaks a required flow
- **MAJOR** — meaningful usability, responsive, state, or interaction defect
- **MINOR** — polish or maintainability issue with limited user impact

Do not inflate cosmetic preferences into blockers.

## Elara-specific priorities

Pay particular attention to:

- 44 × 44 mobile touch targets for primary controls
- visible keyboard focus
- native semantics before ARIA
- no color-only status meaning
- safe-area and bottom-navigation overlap
- long customer/product/repair text
- form input preservation on failure
- stale/pending/failed state truthfulness
- no accidental duplicate mutation affordances
- no `transition: all`
- reduced-motion support
- no Lucide or hand-drawn replacement icons
- no card soup, decorative gradients, or oversized operational chrome
- 405 × 720 mobile composition
- 412 × 915 Android regression view
- desktop Chromium regression

## Output

Group findings by file.

Example:

```text
## src/app/RepairDetail.tsx

MAJOR src/app/RepairDetail.tsx:84 - icon-only action has no accessible name
MAJOR src/app/RepairDetail.tsx:121 - save failure discards entered finding text
MINOR src/app/RepairDetail.tsx:168 - transition: all -> list intended properties

## src/app/RepairDetail.css

✓ pass
```

State the problem and location.

Add explanation only when the fix or risk is not obvious.

## Evidence discipline

A successful lint, typecheck, or unit test does not prove interface quality.

A screenshot does not prove keyboard or semantic behavior.

An automated accessibility scan does not prove WCAG conformance.

Use the evidence appropriate to the claim.

## Completion

A review is complete when:

- affected files were inspected
- relevant local rules were applied
- meaningful UI was visually checked where possible
- findings are actionable and evidence-based
- domain/product boundaries were preserved
- unverified behavior is identified as unverified

---

Adapted for Elara Relay from Vercel Labs' `web-design-guidelines` skill and
Web Interface Guidelines, MIT licensed.
