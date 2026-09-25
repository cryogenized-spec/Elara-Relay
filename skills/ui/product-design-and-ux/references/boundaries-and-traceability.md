# Boundaries and Traceability

Keep product-design work inside its authority.

Elara's UI should expose approved product and domain behavior clearly. It should
not invent requirements, reopen settled architecture, or hide missing domain
behavior behind frontend state.

## Authority boundaries

| Concern | Primary authority |
|---|---|
| Product direction and Phase scope | `documents/App_Direction.md` |
| Visual direction | `documents/Layout_Guide.md` |
| Domain behavior and lifecycle | `src/contracts/`, `src/domain/`, relevant `docs/` |
| Product interaction and recovery | this skill |
| Visual implementation | `skills/ui/frontend-design/SKILL.md` |
| Interface audit | `skills/ui/web-design-guidelines/SKILL.md` |
| Detailed accessibility review | future/local accessibility skill |
| PR certification | `skills/SKILL.md` |

When authorities disagree, do not silently choose the most convenient rule.
Identify the conflict and route it to the owning layer.

## Evidence versus assumption

Use repository evidence when it exists.

Examples include:

- current domain contracts
- migration constraints
- domain tests
- reviewed product documentation
- existing operational workflows
- rendered UI behavior

Do not manufacture user research, production analytics, customer behavior, or
business policy.

If a design decision is not supported by evidence, call it an assumption.

For consequential assumptions record:

- what is assumed
- why it matters
- who or what can resolve it
- what would change if the assumption is wrong

## Lightweight traceability

Do not create IDs and matrices for ordinary polish work.

Use explicit traceability when the work introduces or changes consequential
behavior across several layers.

Useful identifiers include:

- `O-##` — operational outcome
- `D-##` — design decision
- `T-##` — task or flow
- `IC-##` — interface contract
- `AC-##` — acceptance criterion

A reviewer should be able to move both directions:

- outcome -> interface behavior -> acceptance evidence
- interface behavior -> domain/product authority or explicit assumption

Use `../templates/outcomes-to-design.md` when that trace would materially
reduce ambiguity.

## Do not cross these boundaries

Product-design work must not:

- create a parallel lifecycle in the UI
- weaken domain validation
- bypass optimistic revision checks
- change approval requirements
- turn AI into an implicit authority
- redefine Events as editable current state
- treat Scheduled Actions as browser timers
- expose database or worker implementation details as product concepts
- claim WCAG conformance from a design review
- treat a screenshot as proof of interaction behavior

If an interaction requires missing domain capability, make that dependency
explicit.

## Accessibility routing

Carry observable accessibility requirements into the interaction contract, such
as:

- keyboard reachability
- focus destination
- meaningful accessible name
- error recovery
- reflow
- non-color status cues
- reduced-motion behavior

Detailed semantic, ARIA, assistive-technology, and conformance evaluation should
be handled by the accessibility-specific review skill rather than duplicated
here.

## Completion

Boundary and traceability work is sufficient when a reviewer can tell:

- which authority owns each consequential behavior
- which decisions are evidence-backed
- which decisions remain assumptions
- what implementation may safely decide
- what must be resolved before implementation proceeds

Do not add traceability ceremony where the task is already obvious.
