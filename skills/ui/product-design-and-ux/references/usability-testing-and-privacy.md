# Usability Testing and Privacy

Use usability work to answer a bounded product-design question with real,
authorized evidence.

Do not manufacture customer truth.

Do not invent participants, observations, quotes, consent, or findings.

## Authorization

Before collecting participant data, identify:

- the decision the study may inform
- who owns that decision
- who may participate
- what data will be collected
- whether recording is involved
- where data is stored
- how long it is retained
- who may access it
- what deletion/withdrawal path exists
- whether legal, privacy, security, or other review is required

An agent may help draft study material or synthesize evidence already supplied.

It cannot provide consent on another person's behalf or decide that privacy
requirements do not apply.

## Define the question

Start with:

1. the design question
2. what behavior or decision could change
3. the participant role/context
4. the representative task
5. the starting state
6. what would count as completion
7. prototype limitations
8. what the study cannot establish

Do not choose participant count or success thresholds by habit.

Match scope to the uncertainty and risk of the decision.

## Task design

Write tasks as realistic goals.

Do not provide step-by-step instructions that reveal the interface being
evaluated.

Avoid leading wording.

Include interruption, failure, permission, or recovery only when those behaviors
are relevant to the research question and can be tested safely.

## Safe data

Prefer synthetic Elara fixtures.

Examples:

- `JOB-DEMO-042`
- `repair-demo-7`
- `customer@example.test`

Do not ask participants to enter:

- real passwords
- API keys
- payment data
- financial access
- private credentials
- secrets
- unnecessary personal information

Use approved environments when realistic data is genuinely required.

## Simulated behavior

Do not claim a prototype performed a side effect it cannot perform.

If persistence, notifications, approvals, email, or other external effects are
simulated, mark that limitation explicitly.

A simulated success state is not evidence that the integrated workflow works.

## Observation discipline

Keep separate:

- what the participant did
- what the participant said
- what the observer inferred
- what design implication is proposed
- what decision was ultimately made

A preference is not automatically a usability failure.

Task completion does not prove the experience was free of confusion or risk.

## Reporting

Report findings in the context of:

- task
- state
- participant role
- environment
- prototype fidelity
- observed behavior
- limitation

Preserve disagreement and negative cases.

Do not generalize a small usability exercise into:

- population prevalence
- product analytics
- WCAG conformance
- business outcome
- universal preference

## Elara-specific emphasis

Useful usability questions may include:

- Can the operator identify what needs attention on Today?
- Can they distinguish a Job from a Task?
- Can they understand a Repair's current stage and next action?
- Can they resume after interruption?
- Can they recover from a failed save without losing work?
- Can they understand Waiting and follow-up state?
- Can they distinguish a prepared AI/external action from an executed one?
- Can they search for operational truth without knowing implementation terms?

Use these as examples, not mandatory study scripts.

## Template

Use `../templates/usability-study.md` when authorized usability work is actually
being planned or synthesized.

Leave results sections empty until real authorized evidence exists.

## Completion

Usability work is useful when:

- it answers a specific decision question
- evidence is real and authorized
- participant data is minimized and handled deliberately
- prototype limitations are explicit
- observation is separated from inference
- claims remain within the evidence boundary
