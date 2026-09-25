---
title: "Avoid Expensive Barrel Imports"
impact: "medium"
---

# Avoid Expensive Barrel Imports

A barrel file re-exports many modules through one entry point.

Large third-party barrels can increase module analysis, development startup,
and bundle work.

Prefer direct package subpath imports when:

- the package officially supports them
- TypeScript types remain intact
- bundle evidence shows the barrel is expensive

## Do not cargo-cult direct imports

Do not deep-import undocumented internal package paths.

A smaller import path is not worth:

- implicit `any`
- unstable private paths
- broken upgrades

Check the package's documented exports.

## Internal Elara barrels

Small internal index files are acceptable when they improve readability and do
not drag large dependency graphs into unrelated code.

Do not ban every `index.ts`.

## Icon note

Elara uses Iconify/Solar direction.

Do not introduce another icon package merely to chase import performance.

## Measure

Use Vite bundle output or actual development/build evidence before performing a
large import rewrite.

## Completion

Import cleanup is successful when it reduces unnecessary module work while
preserving stable typed public imports and readable code.
