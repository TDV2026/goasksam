# docs/screens/e98: which screens are fixtures and which are live

- `live/` : LIVE. Taken from goasksam.com with the crew cookie on Oct 28 2026, 18:55Z to 18:57Z (Lane F's gap). Real engine answers, real sales, the code that was live then (before the narrow strip and the Find card slots).
- `narrow/` : FIXTURES. Rendered offline from scripts/e98Fixtures.mjs through the real page code in this branch. The answers are hand-built to define the shape until the engine sends it (ENGINE READY 9 chart, ENGINE READY 10 findAnswer). Every fixture is internally consistent (17 sales everywhere, option counts add up, sale rows belong to the car, the sales behind the answer sit inside a shown range); scripts/underlineCheck.mjs fails if one is not.
- everything else directly in `e98/` : older FIXTURE shots (before the narrow strip), kept for history.
