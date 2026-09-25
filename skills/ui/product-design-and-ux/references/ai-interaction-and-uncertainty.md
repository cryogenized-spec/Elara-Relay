# AI Interaction and Uncertainty

Use this reference when an Elara surface includes:

- generated content
- summaries
- recommendations
- natural-language Capture
- retrieval
- conversational input
- tool use
- proposed external actions

AI is optional in Elara.

The manual product must remain complete without it.

## Define the AI role

State whether the AI is:

- assisting
- drafting
- summarizing
- recommending
- interpreting
- routing
- preparing an action
- executing an already-authorized operation

Do not blur these roles.

A draft is not an action.

A recommendation is not a decision.

A tool request is not proof that an effect occurred.

## Authority

AI does not automatically inherit the operator's authority.

For consequential actions define:

- what the AI may inspect
- what it may propose
- what it may prepare
- what requires human review
- what requires explicit approval
- what the server/domain revalidates at commit
- what the AI is prohibited from doing

Customer- or supplier-facing external actions retain Elara's explicit approval
boundary unless reviewed policy intentionally changes it.

## Context and freshness

For AI output that depends on Elara or external context, identify:

- source
- owner
- permission
- freshness
- missing-context behavior
- stale-context behavior
- conflicting-context behavior
- what the operator can inspect

Do not silently treat incomplete context as complete.

Do not invent a confidence percentage to make uncertain output look rigorous.

If the information required for a safe action is unavailable, prefer:

- clarification
- explicit limitation
- source inspection
- safe fallback
- no action

over fabricated certainty.

## Grounding

A link or citation is an affordance for verification.

It does not prove that the generated claim follows from the source.

When grounding matters, preserve enough information for the operator to inspect
the relevant source or domain object.

Do not describe generated reasoning as verified evidence.

## User control

For generated or recommended output provide only controls the product actually
supports.

Possible controls include:

- edit
- accept
- reject
- retry
- clarify
- inspect source
- fallback to manual flow

Do not expose a fake control whose result cannot be honored reliably.

## AI-specific states

Add states only when the task creates them.

Possible states include:

- pending
- streaming
- partial
- complete
- unsupported
- uncertain
- stale context
- conflicting context
- blocked by permission
- failed
- corrected
- approved
- committed

For each relevant state define:

- what is visible
- what work is preserved
- what the operator may do
- what transition is possible
- what proves completion

Do not represent a committed state until the durable or external effect is
confirmed.

## Tool-using flows

When AI uses tools or several steps, distinguish:

- proposed action
- approved action
- request sent
- partial success
- confirmed success
- failure

A multi-tool workflow may partly succeed.

If that is possible, show which effect occurred and what remains unresolved.

Retry must respect Elara's mutation/replay and external idempotency protections.

## Manual fallback

An AI-assisted flow should have a manual path when practical.

The fallback should preserve useful context without silently continuing AI
processing.

Examples:

- natural-language Capture falls back to manual Task/Repair/Reminder fields
- generated draft can be edited manually
- failed summary does not block access to the underlying Timeline
- unavailable AI does not block ordinary Work, Repairs, Schedule, or Search

## External actions

For AI-assisted outbound work preserve:

1. AI preparation
2. human review
3. explicit approval
4. execution
5. confirmed outcome

Do not use interface language that makes preparation look like execution.

## Feedback

Feedback may indicate:

- accepted
- edited
- rejected
- corrected
- escalated
- task completed

Treat these as product signals.

They are not automatically proof of model correctness.

Do not collect secrets or unnecessary personal information merely to improve
feedback.

## Change verification

When changing an AI model, prompt, retrieval source, tool policy, or grounding
behavior, verify representative cases such as:

- normal input
- ambiguous input
- unsupported request
- stale context
- conflicting context
- permission denial
- interruption
- partial tool success
- manual fallback

Record what was tested and what remains unverified.

Do not use benchmark scores alone as proof that the user-facing interaction is
safe or useful.

## Engineering handoff

Before implementation, consequential AI interactions should make clear:

- AI role
- authority boundary
- context and freshness
- human review requirement
- prohibited side effects
- visible uncertainty behavior
- correction/fallback
- pending/partial/failure states
- completion evidence

Use `../templates/ai-interaction-contract.md` only when this detail cannot be
captured clearly in the ordinary interface contract.

## Completion

AI interaction design is ready when:

- the manual product still makes sense
- the AI role is explicit
- authority is not implied
- stale/missing context is handled
- uncertainty is actionable
- external actions preserve review and approval
- partial failure has a recovery path
- committed state requires real confirmation
