# AI Interaction Contract

Use alongside `interface-contract.md` when AI materially affects a user-facing
flow.

## Identity and authority

- Contract ID / surface:
- Linked outcome / task:
- AI role: assist / draft / summarize / recommend / interpret / prepare / execute:
- Human decision owner:
- Review / approval boundary:
- Prohibited side effects:
- Relevant model / prompt / retrieval / tool version:

## Context

| Source | Permission / owner | Freshness | Missing / stale / conflict behavior | What the operator can inspect |
|---|---|---|---|---|
|  |  |  |  |  |

## Output and control

| State | What is shown | Operator action | Persistence / side effect | Recovery / fallback |
|---|---|---|---|---|
| Pending / streaming |  |  |  |  |
| Partial |  |  |  |  |
| Complete |  |  |  |  |
| Unsupported / uncertain |  |  |  |  |
| Failed / blocked |  |  |  |  |
| Approved / committed |  |  |  |  |

## Manual fallback

- Non-AI path:
- Context preserved when falling back:
- Behavior when AI is unavailable:

## External action

- Prepared:
- Reviewed:
- Approved:
- Executed:
- Confirmed:

## Change verification

| Scenario | Expected observable behavior | Evidence | Result |
|---|---|---|---|
| Normal input |  |  |  |
| Ambiguous / unsupported |  |  |  |
| Stale / conflicting context |  |  |  |
| Permission / approval case |  |  |  |
| Partial action / interruption |  |  |  |

Do not mark an unrun or blocked scenario as passed.
