# e96 page contract (Lane B to Lane C)

Stamp `e96-20261028-options`. Rule: pages and emails compute nothing. Every word and number below comes from `oneEngineAnswer`; a page prints the field or prints nothing.
All fields are on the engine answer and on `CARD_FIELDS` (`lib/engineFields.js`), so Sell and Find cards carry them.

## States (`optionsState`)

| state | pooled range (`cluster`, `low`, `high`) | what to print | `emailMode` |
|---|---|---|---|
| `none` | as today | no options | `range`, `sales` or `none` as today |
| `alike` | kept | the range, then `optionLines` under it (one line per option) | `range_with_options` |
| `split` (medians 15 percent apart, or mileage explains a wide range) | `null` | `headlineLines`, one line per option, no pooled number, no pooled chart | `options` |
| `apart` (ranges do not overlap, or year groups price apart) | `null` | `headlineLines`, same as split | `options` |

`headlineDimension` names the one dimension shown (`body`, `gearbox`, `edition`, `mileage`, `year`). Other dimensions that also split ride in `refineOptions` (`dimension`, `label`, `value`, `n`): print them as a chip row, never as ranges. `pooledApart` stays set for split and apart (`pooledApart.state` says which); `pooledSplit` is retired.

## Option fields (`options[]`)

`dimension`, `label`, `value`, `n`, `low`, `high`, `median`, `rangeFloor`, `windowMonths`, `windowWords`, `ownWindow` (true: the count is read over the option's own window), `windowLonger`, `windowNote` (only beside a range), `wideCause`, `wideLever`, `wideLine` (only when the option's own range is wide), `refine`, `exact` (year options: the typed year).

- `rangeFloor: true`: print `optionLines[i]` ("Convertible, 5 sales, too few for a range"). No range, no window note.
- `optionsNote`: when the options add up to more than the headline count, print it once under the lines.
- `refine`: what a click sends back to `oneEngineAnswer` unchanged: `{body}`, `{tx}`, `{variant}`, `{year}`, `{miMin, miMax}`. Combined refines (`{body, tx}`) return the combined set. A set under 3 sales comes back with `rangeFloor: true` and no range.
- The exact year is listed first among year options.

## Wide ranges

`wideCause` (`mileage`, `year`, `mods`, `none`), `wideLever` (`mileage`, `year`, null), `wideLine` on the answer when the printed range's top is above 1.6 times its bottom. Print `wideLine` under the range. Mileage that explains a wide range (two bands of 3 or more sales) becomes the split (`headlineDimension: "mileage"`, options "Under 50,000 miles", "50,000 to 100,000 miles", "Over 100,000 miles"); the exact mileage box still refines further.

## Typed mileage

Send `{miTarget: n}` only. The engine builds the band (15,000 miles either side under 60,000, 25,000 from 60,000 up) and returns `mileageBand` (`target`, `miMin`, `miMax`, `narrowed`, `n`, `windowWords`, `windowMonths`, `line`). Print `mileageBand.line` in the mileage slot whether the band narrowed or not (under 8 sales it says "Too few sales near N miles to narrow it. This is the range for all N."). The "Add mileage to narrow the range" line must not print once a mileage is set.

## Cards and tiles

- Each card in `cards` carries `rangeLabel` ("Above the typical range", "Below the typical range") when its price is outside the printed range; print it on the card. `representative.closest/high/low` come from inside the range; a borrowed one carries `rangeLabel`.
- A card with `milesHidden: true` prints no mileage line (`mileageText` is null, `mi` is null on the shared cards).

## Window words

- `windowLine` ("12 sales, since December 2025.") names the card's window on every result.
- `chartCaption` ("By quarter, November 2023 to September 2026. Quarters with fewer than 5 sales are left out.") under the chart.
- `chartWindowLine` ("The chart covers 33 months, the range the last 11.") when the two differ; null otherwise.
- `yearNote` ("No 2010 sales in this range. These are 2008 to 2009 cars.") when the range leaves out the typed year; `yearExcluded` is its flag.

## Gearbox words

`label` on a gearbox option and every gearbox chip come from `GEARBOX_WORDS` in `lib/modelRules.js` (SMG, DCT, Tiptronic, PDK, F1, E-Gear, Sportshift, else Automatic). Find's listing label uses the same table.

## Retired

`pooledSplit` is never set. The page must not read it; use `options` and `optionsState`. The page must not compute the mileage band (`submitMileageInline` in `public/js/onebox.js` sends `miMin`, `miMax` and `miTarget` today; it should send `miTarget` only).

## Option windows (e100, Oct 28; read-time fields, no stored answer changes)

- An option read over a window other than the footer's carries `windowDiffers: true` and `ownWindowLine` ("11 sales since March 2025"); `optionLines[i]`, `headlineLines[i]` and `matchedOption.line` already contain it ("Targa $61,000 to $82,000, 11 sales since March 2025"). Print the line, or print `ownWindowLine` where the count is printed alone. Compute nothing: the count is `options[i].n`, the since date is `options[i].windowWords`.
- `optionsNote` is null and `options[i].windowNote` is null: no explanation sentence about time spans prints anywhere. A page that still prints "Option counts use their own time spans" prints a sentence the engine no longer sends.
- `optionsRemainder` ({ n, dimension, line }, "3 sales do not say their gearbox.") when the options add up to fewer sales than the footer and no option has its own window. `refineOptions` entries that repeat a headline option carry `ofOptions: true`; print options as lines and refineOptions as chips, never the same pill from both.
