# One Box — Step 3 (class taxonomy) backlog

Findings parked here during the Sep 2026 method-review close-out. **Do not fix in the render
port**; these belong to the class-taxonomy work (step 3), to be picked up when the non-sold
backfill and OCD reset allow. Filed so they are not lost.

## Residual findings from the ten-car method review

1. **365 sub-model resolver drop.** `resolveVehicle` drops Ferrari sub-model trims
   (`GTC`, `GTB/4`, `GT 2+2`) and returns a bare model `365`. The reader's actual car
   (e.g. 365 GTC) is then answered as "the Ferrari 365". The high-dispersion base pools
   still land honestly (varied refusal or span-without-cluster), so no invented band is
   shown, but the sub-model label is lost. Fix belongs with a Ferrari class/model taxonomy
   that recognizes the coachbuilt sub-models as distinct models, not trims.

2. **Body-scoping false-thinness (Viper RT/10).** Answering the body question with
   `roadster` gutted the Viper RT/10 pool to a thin refusal, while body-agnostic it is a
   clean 38-sale pool. The archive does not reliably tag RT/10s as "roadster", so body
   scoping drops most of the pool. A trim that already implies a single body (RT/10 =
   roadster) should not trigger the body ask, and body scoping should tolerate untagged
   records of the implied body.

3. **"Roadster Roadster" duplication.** When the resolved trim equals the body style
   (300SL Roadster, Viper RT/10 + roadster), the headline prints the body word twice
   ("Mercedes-Benz 300SL Roadster Roadster"). Pre-existing headline-subject duplication;
   de-dupe trim vs body in `headlineSubject`.

## Era-reuse blend nameplates (confirmed step-3 material, not code-fenced)

These blend genuinely distinct models under one token, but the blend is a **model-level /
era-reuse** ambiguity, not a trim-to-family widen — so the trim-path fence in
`NO_FAMILY_WIDEN` (lib/onebox.js) does not fire on them, and year-scoping + generation
clarification already carry most of the load. Handle with the class taxonomy:

- **Alfa Romeo 8C** — prewar 2900 (millions) vs 2007 Competizione (~$300k), same token.
- **Alfa Romeo 1900** — sedan vs coachbuilt C vs C52 Disco Volante ($1.27M).
- **Maserati Ghibli** — 1967 classic (~$350k) vs 2014 sedan (~$13k).

Reference: the audit ran via `GET /api/usageDashboard?view=ops&task=nblend` (read-only,
archive-only). Ratio ≥5 AND ≥3 distinct title-heads flags a blend-risk model token; the
list distinguishes genuine distinct-model blends from legitimate trim/halo spread.
