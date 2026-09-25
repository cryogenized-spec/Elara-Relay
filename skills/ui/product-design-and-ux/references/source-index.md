# Source and Authority Index

Use each source only for the kind of decision it can actually support.

Elara's repository is the primary authority for Elara-specific behavior.

External design guidance is supporting evidence, not permission to override the
product or domain model.

## Repository authorities

| Source | Use |
|---|---|
| `AGENTS.md` | repository-wide engineering and authority rules |
| `documents/App_Direction.md` | product thesis, Phase scope, durable product constraints |
| `documents/Layout_Guide.md` | canonical visual and mobile layout direction |
| `src/contracts/` | typed domain contracts |
| `src/domain/` | business rules and lifecycle behavior |
| `docs/repairs-domain.md` | Repair-specific behavior |
| `docs/scheduler-domain.md` | Scheduled Action behavior |
| `docs/supabase-runtime.md` | persistence/auth/runtime boundary |
| `skills/ui/frontend-design/SKILL.md` | visual design method |
| `skills/ui/web-design-guidelines/SKILL.md` | post-implementation interface review |
| `skills/SKILL.md` | canonical PR review/certification skill |

When repository sources conflict, identify the owning authority rather than
silently averaging them.

## Upstream skill source

This Elara skill is adapted from:

`magnus919/agent-skills/product-design-and-ux`

License: MIT.

The upstream corpus informed:

- information architecture
- force-driven state modeling
- interface contracts
- cognitive demand
- interaction-pattern tradeoffs
- AI uncertainty/control
- usability evidence boundaries
- engineering handoff
- traceability

Elara-specific domain, approval, mobile, and verification rules replace generic
organizational routing where appropriate.

## External references

The upstream skill draws on established sources including:

- ISO 9241-210 human-centred design
- WCAG 2.2
- W3C cognitive accessibility guidance
- GOV.UK design and user-research guidance
- USWDS design principles

Use those sources for the scope they actually cover.

Do not infer from them:

- Elara domain rules
- Elara permissions
- Elara lifecycle behavior
- mandatory component choices
- a universal research method
- WCAG conformance from a usability or visual review

For detailed accessibility claims, verify the current authoritative accessibility
source rather than relying on this UX skill as a standards summary.

## Source discipline

For consequential decisions:

1. identify the source
2. identify what claim it supports
3. distinguish requirement from example or guidance
4. preserve conflicting evidence
5. record assumptions when no source resolves the question

Do not cite a source merely because its vocabulary resembles the design choice.

The source should actually support the reasoning.

## Freshness

Repository behavior should be checked against the current branch before
implementation.

External standards and rolling guidance should be rechecked when a task depends
on their current wording or status.

Do not freeze a time-sensitive external rule into Elara merely because an older
skill file contained it.

## Licensing

Upstream Product Design & UX material:

- repository: `magnus919/agent-skills`
- license: MIT
- adaptation: rewritten and scoped for Elara Relay

Preserve attribution when materially reusing upstream text or structure.
