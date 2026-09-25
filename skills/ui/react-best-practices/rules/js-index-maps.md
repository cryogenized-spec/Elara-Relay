---
title: "Build a Map for Repeated Keyed Lookups"
impact: "low-medium"
---

# Build a Map for Repeated Keyed Lookups

When code repeatedly scans the same array by identifier, build an index once.

Prefer:

```ts
const partyById = new Map(parties.map(party => [party.id, party]))

const rows = jobs.map(job => ({
  job,
  party: partyById.get(job.partyId),
}))
```

over calling `.find()` across the full Party list for every Job.

## Good candidates

This can help when joining client-side data such as:

- Jobs -> Parties
- Tasks -> Jobs
- Repairs -> Jobs
- Scheduled Actions -> linked work

only when the arrays are large enough or the lookup happens frequently.

## Avoid unnecessary indexing

For tiny lists or one lookup, `.find()` is often clearer and fast enough.

Do not create Maps everywhere as a style preference.

## Memoization

If building the index itself becomes repeated render work, consider deriving or
memoizing it at the appropriate boundary.

Measure before adding complexity.

## Domain boundary

This is a client-side lookup optimization.

It does not replace relational integrity or PostgreSQL queries.

## Completion

Build an index when repeated linear lookup is a real hot path and the Map makes
both performance and intent clearer.
