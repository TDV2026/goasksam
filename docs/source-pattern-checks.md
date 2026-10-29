# prePush checks that match the SOURCE TEXT of lib/onebox.js, lib/live/search.js, lib/reasonWords.js or lib/engineFields.js (Lane B, Oct 29 2026)

Cause that prompted the list: scripts/storedTextCheck.mjs matched `export function withReadFields(d, text, vehicle) { ... d = freshenStoredText(d)` in lib/onebox.js; 35d1c0d4 made withReadFields a wrapper and the pattern no longer matched, though the behaviour was unchanged.
storedTextCheck now gives withReadFields and marketFromCore a stored row with a retired sentence and asserts the sentence they return (it fails when withReadFields stops restating).

Still source patterns (each breaks on a rename or a wrapper of the named function, none guards a number): 
- appliedAllCheck.mjs:16 slices the text between `export function appliedFiltersOf` and `export function appliedLineOf` (a rename or a new function between them breaks it).
- droppedTrimCheck.mjs:50 regex on the `if (!named) d = { ...d, rungLabel: ...` line (its 13 behaviour assertions stay).
- findNoPickCheck.mjs:77 regex on `refreshMcRowBehind(env, spec)` in lib/live/search.js.
- findThinSalesCheck.mjs:49-51 regexes on listingMarket's thin_sales pass-through and thinZeroMem lines.
- noneRowReasonCheck.mjs:25 regex on the ladder fallback line `if (!firstCount && !notTracked && !zeroThin && !refusal) refusal = noneReasonFor(...)`.
- gearboxWordCheck.mjs:66 regex on the `const lbl = ` lines of the pooled option builder.
- noQuestionRuleCheck.mjs:16,18 regexes on the process-variable guards (these guard a test switch, the text is the point).
- questionWayOutCheck.mjs:55 and questionPayloadsCheck.mjs:32 regex on the literal `skipLabel: "Just show what sold"`.
- findSalesButtonCheck.mjs:36 regex on `gearboxWord: houseGearboxOf(r,`.
- exactYearLineCheck.mjs:7 slices `async function exactYearLineFor` (not in prePush).
- notTrimsRefineCheck.mjs:19, notTrackedCardCheck.mjs:13, rangeRulesCheck.mjs, setAsideLineCheck.mjs (not in prePush).
Pages and other files (not the four above) are matched by chartNoReasonCheck, e96PagesCheck, partnerEngineMatch and emailModeCheck; they are outside this list.
Behaviour guards worth converting next (a stored or fresh answer in, a printed field out): findThinSalesCheck 49-51, noneRowReasonCheck 25, findNoPickCheck 77, droppedTrimCheck 50.
