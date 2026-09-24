# Sam Desk: Question Understanding and Agents Spec

Sep 24, 2026 · @Sam

## 0. The one-page version

**What Sam Desk is.** The market record for enthusiast vehicles, for businesses: type or say a question, get the answer in seconds with the real sales under every number, and set standing jobs ("agents") that do the repetitive work overnight. 99% of its revenue is business, not consumer.

**Who pays, in order.**

1. **Online auction platforms and auction houses** (seats): triage the inbound or the catalogue, consignment pitches, competitive share, market intelligence.
2. **Insurers and lenders** (annual licence): check a book of declared or collateral values on the Desk, plus the same read delivered by API into their quote or loan flow. This is the insurance variant of the engine, sold as a better input, never as "replace HVT".
3. **Dealers and consignors** (seats, later, lower price): what is moving, where a car should go, inventory against the market, lead triage through the PowerSeller flow.
4. **Consultancies, private equity and OEMs** (engagement licence): a fixed-term licence for a project (due diligence on a platform or dealer group, a heritage programme, a market sizing), with analyst seats, aggregate exports and the right to cite "Source: GoAskSam". Requires the OldCarsData rider (retention, derivative works, sublicensing) to be signed first.

**Not a segment:** media (cheap or free seats in exchange for citation; distribution, not revenue) and collectors or family offices (they come through /sell and One Box).

**Why anyone pays.** Nobody neutral holds the whole market on one basis. Hagerty owns a marketplace and a house. Hammer Price belongs to a media group. Bring a Trailer belongs to a publisher. Classic.com sells into Hagerty's funnel. Each sees its own corner. The Desk is Switzerland: every venue on the same hammer basis, deduped across venues, specials set aside, coverage stated, receipts on everything, and no venue favoured because it pays us.

**The four things that make it more than a comps lookup** (comps lookups exist and are commodity):

1. The canonical archive: cross-venue, chassis-matched, hammer basis, parts and specials out.
2. The understanding layer (this spec): slang, groupings, vague words and follow-ups become precise, visible readings. Ask anything; see how it was read; correct it by chatting.
3. Receipts and coverage on every number, so an analyst can defend it to a boss or a client.
4. Agents: standing jobs with a rule and a finished output, not saved searches.

**Non-negotiables.** Better nothing than a fake number. No silent drops. Neutrality rules (section 14). Language rules (no worth, valuation, estimate, appraisal in our voice). Five seconds to an answer for the common questions (section 15).

**How to read this doc.** Sections 1 to 9 are the understanding layer. Section 10 is agents. Sections 11 to 13 are tests, build order and exports. Sections 14 to 16 are neutrality, speed and what we borrow from other products.

## 1. Why this exists

On Sep 24 five natural-language questions were put to the Desk and none was answered correctly. Two failed honestly ("car not resolved", "nothing to run"). Three answered a different question without saying so, which is the failure a Hagerty analyst would trust and act on.

| Question | What the Desk did | Failure type |
| --- | --- | --- |
| best F-body cars from the 90s | "Car not resolved" | Honest miss: no dictionary for F-body |
| Z28 vs Trans Am WS6, last 3 years | "Nothing to run" | Honest miss: no comparison type |
| which Fox body Mustangs are rising fastest | Every Mustang 1965 to 2026 by model year; "rising fastest" ignored; Read about resold chassis | Silent substitution |
| air-cooled 911s under $100k sold this year | Ignored "under $100k" (chart to $3.9m); 100+ thin rows; a Carrera Cup race car in receipts | Silent drop plus a leak |
| what 90s Japanese sports cars sold most on Cars & Bids | Read as "1990s Porsche JAPANESE"; 0 sales; empty $0 chart | Invented interpretation |

**Principles for the understanding layer**

1. **Better nothing than a fake number.** An honest "I can't read that" beats a confident answer to a different question. The interpreter may never invent a make, model, year range or metric that the dictionary and archive cannot confirm.
2. **Show the reading before the answer.** Every answer opens with how the question was understood, as editable chips. The user can correct it in one click.
3. **Ask only when the answers would differ.** "Best" gets one follow-up. "Last 3 years" does not.
4. **No silent drops.** Every phrase in the question is used, defaulted, or flagged as not applied. Nothing disappears.
5. **One engine.** Scoping, set-asides and pools come from the same shared internals as One Box and /sell, so the Desk never disagrees with them.
6. **The language rules still apply.** No "worth", "valuation", "estimate", "appraisal" or "undervalued" in our own voice. Users may type them; we translate and say what we measured instead.
7. **Receipts under every number**, whatever the question shape, including comparisons, rankings and agent outputs.

## 2. How a question travels

Today the Desk goes straight from typed text to the query DSL, which is why slang fails and vague words get dropped. The new path adds an understanding step, a reading card and an optional clarifying question before anything runs.

1. **Typed text** (anything: slang, a VIN, half a sentence, two cars, a price cap).
2. **Interpreter** produces a structured reading: subject scope(s), filters, window, channel or venue, grouping, metric, ranking, question type, and a list of every phrase with its fate (used, defaulted, not applied).
3. **Validator** checks every scope against the resolver and the archive (does this make, model, generation, grouping exist in our data?), every metric against the DSL, and rejects anything the interpreter invented. Confidence is scored per part.
4. **Reading card** renders the interpretation as editable chips, always, above the answer: "F-body = Camaro, Firebird, Trans Am · 1990 to 1999 · ranked by median · last 36 months · all channels".
5. **Clarify** only if a part is ambiguous in a way that changes the answer (see section 7). One question, two to four options, tap to continue. Otherwise a sensible default is taken and shown as a chip the user can switch.
6. **Query DSL** is filled from the validated reading, never from free text. The DSL grows to cover comparisons, price and mileage filters, rankings and trend metrics.
7. **Answer layout** (section 8): headline, chart, table, read, receipts, coverage footer.
8. **Thread** is saved to the left rail with its reading, so it can be reopened, refined and referenced.

Two hard stops:

- If validation leaves no usable scope, the Desk says what it could not read and offers the nearest things it can answer. It never runs a guessed scope.
- If a filter cannot be applied (we hold no condition grades, for example), the answer runs without it and the reading card says so in words: "Not applied: 'concours condition' (we don't record condition)".

## 3. The interpreter: AI plus dictionary plus validator

A hand-written parser cannot cover "type anything". A model on its own will invent things ("1990s Porsche JAPANESE"). The design uses both, with the dictionary as the source of truth and a validator between the model and the query.

**The model's job** is narrow: read the sentence, identify the parts, and map each part to dictionary entries and DSL fields. It is given the dictionary, the DSL schema, and the archive's list of makes, models and generations. It returns structured JSON only, with a phrase-by-phrase account. It is told, in the prompt, that it may not name any make, model, generation or grouping that is not in the lists it was given, and that unknown phrases go into "unresolved", not into the scope.

**The dictionary's job** is to be the only way slang, platforms, groupings and eras become scope. If "F-body" is not in the dictionary, the question fails honestly and the phrase is logged for the dictionary backlog.

**The validator's job** is to trust neither. Every scope is re-resolved through the same resolver /sell uses; every generation must exist in lib/generations.js; every grouping must expand to real models with sales; every metric must be one the DSL can compute. A reading that fails validation is shown to the user as "I read X but cannot run it", with the nearest valid alternative offered.

**Confidence per part.** Each part of the reading carries high, medium or low confidence. High parts run silently as chips. Medium parts run but are highlighted on the reading card ("I took 'rising' to mean median change over 12 months"). Low parts trigger the one clarifying question.

**Determinism.** The same question must produce the same reading. Model temperature is zero, the dictionary is versioned, and the golden set (section 11) pins the reading for every test question, not only the answer.

**Cost and speed.** One model call per question, small prompt, cached readings for repeat questions. Target under 2 seconds for the reading step. The heavy part remains the archive query.

**Learning loop.** Every unresolved phrase, every clarification the user answered, and every chip the user corrected is logged to a review queue. Sam reviews the queue and promotes entries into the dictionary. The Desk gets smarter from use without the model ever writing to the dictionary itself.

## 4. The dictionary

One versioned file (lib/desk/dictionary.js, with a review queue in the DB). Every entry has: the phrase and its variants, what it expands to (make, model, years, generation, body, or a list of these), a source note, and a status (approved, pending). The model reads only approved entries.

| Category | Examples | Expands to |
| --- | --- | --- |
| Platform and chassis codes | F-body, Fox body, SN95, New Edge, S197, A-body, B-body, E-body, G-body, Panther, E30, E36, E46, F80, 964, 993, 996, 997, FC, FD, NA, NB, Z32, R32, R33, R34, C2, C3, C8, W124, W201, R129 | Make plus model plus year span (F-body = Camaro, Firebird, Trans Am; 1967 to 2002 in four generations) |
| Nicknames | Vette, Stang, Bimmer, Benz, Rover, Jag, Cuda, Bird, T/A, GTI, Beetle, Bug, Duck (2CV), Pagoda, Gullwing, Whale Tail, Widowmaker | Make and model, sometimes a generation |
| Groupings | 90s Japanese sports cars, JDM, air-cooled 911s, muscle cars, pony cars, hot hatches, analog supercars, malaise era, radwood era, youngtimers, Italian exotics, British roadsters, overlanders | A curated model list, shown in full on the reading card so the user can remove entries |
| Eras and decades | 60s, 90s, pre-war, post-war, modern classics | Model-year spans, stated (90s = model years 1990 to 1999) |
| Windows | this year, YTD, last 3 years, past 18 months, since 2023, Monterey week, this quarter, last Monterey | Date ranges; "this year" = year to date; "last 3 years" = 36 months |
| Channels and venues | BaT, C&B, Cars and Bids, PCAR, RM, Gooding, B-J, Broad Arrow, Mecum, the houses, online, live, Monterey, Scottsdale, Amelia, Kissimmee | Source ids, channel filter, or an event as a venue-plus-dates entry |
| Price and mileage | under $100k, six figures, sub-50k, low-mile, under 20k miles, high-mile, a bargain | Numeric filters; "low-mile" gets a stated threshold per era (see section 6) |
| Metrics and rankings | median, typical, average (we answer with median and say so), record, top, highest, cheapest, most sold, volume, share, rising, falling, spread, range | DSL metric plus sort direction |
| Body and variant | coupe, cab, convertible, targa, roadster, wagon, sportbrake, estate, sedan, manual, stick, auto, PDK, Tiptronic | Body and transmission filters where the archive carries them |
| Structural words | vs, versus, compared to, against, by house, by year, by generation, by month, per venue, top 5, top ten | Comparison type, grouping, and limits |

**Rules for the dictionary**

- Groupings are opinions, so each one records who defined it and is shown in full on the reading card. The user can drop a model from the list and the chip updates.
- An entry never widens a scope beyond the models it names. "Muscle cars" does not sweep in every V8 in the archive.
- Entries are checked against the archive when added: an expansion with no sales is flagged, not hidden.
- Ambiguous nicknames (Bird = Thunderbird or Firebird; Evo = Lancer Evolution or M3 Evolution; GT = many) resolve by context (make present, era present) or trigger the one clarifying question.
- Every unresolved phrase from real use lands in the review queue with the question it came from. That queue is the roadmap for the dictionary.

## 5. Question types the Desk must handle

Every question resolves to one of these types. The type decides the metric, the headline and the layout. Types marked NEW are not in the DSL today.

| Type | Example | What the Desk computes | Headline |
| --- | --- | --- | --- |
| Single-car read | E30 M3s, last 3 years | Median, quartiles, count, spread | One number with the spread |
| Record | record sale for a BMW M3 | Highest standard sale since coverage start, top five | The top sale with its receipt |
| Ranking within a set (NEW) | best F-body cars from the 90s | The set expanded to models or generations, ranked by the chosen metric | A short ranked list |
| Trend (NEW) | which Fox body Mustangs are rising fastest | Median change between two stated windows per model or year, with counts; repeat-sales change as a second view | The biggest movers, with the windows stated |
| Comparison (NEW) | Z28 vs Trans Am WS6, last 3 years | Two or more pools side by side: median, spread, count, newest | Two numbers, side by side |
| Filtered list (NEW filters) | air-cooled 911s under $100k sold this year | Scope plus price, mileage, body or transmission filters | One number plus the filtered receipts |
| Venue or channel question | which house sold the most air-cooled 911s | Group by venue with count and median | The top venue |
| Share and mix | share of M3 sales by generation by year | Stacked share over time | The current mix |
| Repeat sales | how many E30 M3s have resold since 2023 | Chassis seen twice, with the change | Count and typical change |
| Coverage and meta | what do you cover for Mecum | The coverage table | Dates per source |
| Yes or no fact | has a Duesenberg Model J sold this year | Count in window, with receipts | Yes or no, with the sales |
| Unsupported (refuse honestly) | what will 993s be worth next year; should I buy this; private sale prices | Nothing runs | A plain sentence on what we can answer instead |

Notes on the new types:

- **Ranking** needs a stated metric. If the question does not give one, the Desk asks (section 6). Members with fewer sales than the thin threshold are shown as thin, never ranked on a spread they do not have.
- **Trend** always states both windows ("Jan to Dec 2025 vs Jan to Aug 2026") and the count in each. A model with under 5 sales in either window is shown but not ranked. Repeat sales of the same chassis are offered as a second, stricter view.
- **Comparison** accepts "vs", "versus", "compared to", "or", "against", and lists ("Z28, WS6 and Cobra"). Each side goes through the resolver separately. Windows and channels apply to both.
- **Filters** apply after the scope, and every applied filter is a chip. A filter the archive cannot support (condition, colour before we store it, options) is flagged as not applied.

## 6. Subjective and vague words

The Desk has no opinions. Every subjective word becomes a stated measurement, and the reading card says which. Where a word could reasonably mean two different measurements, the Desk asks once.

| Word | Options it could mean | Behaviour |
| --- | --- | --- |
| best, top | highest median; rising fastest; most sold; strongest recent results | Ask once, four options |
| hottest, on fire | rising fastest; most sold recently | Ask once, two options |
| rising, climbing, appreciating | median change, this window vs the prior one | Default, shown as a chip with both windows |
| falling, softening, cooling | same as rising, negative | Default, shown as a chip |
| cheapest, entry point, affordable | lowest median in the set | Default |
| priciest, most expensive | highest median in the set | Default |
| bargain, deal | lowest sale vs the set's median ("sold furthest under typical") | Default, worded as measured; never "good buy" |
| undervalued, overvalued | not measurable without a value; reframe as "cheapest relative to X" | Ask: "compared with what?" and reword; never use the word in our voice |
| typical, average, normal | median | Default; the read says "median, not average" once |
| record, highest ever | highest since coverage start | Default, with coverage dates |
| popular, common | most sold | Default |
| rare, hard to find | fewest sold (as a proxy) | Default, stated as "fewest sales in our data", not rarity |
| liquid, sells fast | sold-through and days on market where the source records them (online platforms only) | Default with the limitation stated |
| low-mile, low mileage | under a threshold by era: under 10k for 2010+, under 30k for 1990 to 2009, under 50k before 1990 | Default, threshold shown as a chip the user can change |
| high-mile, driver | above the same thresholds | Default |
| clean, mint, concours, project, rough | condition: not recorded | Not applied, said plainly; the receipts are the evidence |
| numbers-matching, original, restored | recorded only where a title says so | Applied as a title filter and labelled "by title only" |
| worth, value, valuation, appraisal | what cars like this sold for | Translate; the read never uses these words |

**Era thresholds and defaults are configuration**, not code, and live beside the dictionary so Sam can change them.

**The clarifying question format:** the Desk replies in the thread, in words, the way a person would: "By best, do you mean highest prices, rising fastest, most sold, or strongest recent results?" The user can tap one of the options shown under the message or type an answer in the chat box ("highest", "the ones going up"). Either way the choice becomes a chip that can be switched later. Buttons are for speed; typing is the default behaviour of a chat, and the interpreter reads the reply against the same options.

## 7. Clarification rules and the no-silent-drops rule

**When to ask**

- A word maps to two or more measurements that would give materially different answers (best, hottest, undervalued).
- A nickname resolves to two different cars and the sentence gives no make or era (Bird, Evo, GT).
- Two cars are named with no comparison word and no grouping word ("Z28 Trans Am").
- A grouping is large and the question names no metric ("90s Japanese sports cars" alone).

**When not to ask**

- Windows, channels, venues and price caps are stated: apply them.
- A default exists and is shown as a switchable chip (rising = median change; typical = median; this year = YTD).
- The scope is one car: run it. The user can refine from the chips.

**Limits:** one clarifying question per query, never a chain. If two things are ambiguous, ask the one that changes the answer most and default the other with a highlighted chip.

**Conversation, not one-shot.** Every thread is a chat. After an answer the user can type a follow-up that changes the reading rather than starting over: "online only", "drop the Miata", "make that last 5 years", "now compare with the E36". The interpreter treats a follow-up as an edit to the current reading (it carries the thread's reading as context), the reading card updates, and the answer panel re-renders in place. Previous versions of the answer stay reachable from the thread's turn list, so the screen never becomes five stacked tables. The chat box sits at the bottom of the thread, where a chat box belongs; the reading card and the answer sit above it.

**Recent behaviour as context.** Ambiguity is resolved first from the thread and the user's recent threads: if the last three questions were about the E30 M3, "E30" reads as M3 with a highlighted chip, not a question. The user can always correct it by chat or by chip.

**The no-silent-drops rule**

The interpreter returns every phrase of the question with one of three fates, and the reading card shows them:

- **Used:** became a chip (scope, filter, window, metric).
- **Defaulted:** the Desk chose ("rising = median change, 12 months vs prior 12"), highlighted so the user sees a choice was made.
- **Not applied:** the archive cannot support it ("concours condition", "private sales"), stated in words above the answer, never hidden.

A question whose every phrase ends up "not applied" does not run; the Desk says what it can answer instead. This rule has its own golden test: for each test question, the set of chips plus not-applied notes must account for every phrase.

**Empty and thin outcomes**

- Zero sales after a valid reading: an empty state in words ("No 1990s Japanese sports cars sold on Cars & Bids in the last 36 months in our data"), the reading card still shown, and a one-tap widen (all channels, longer window). Never an empty chart or a $0 axis.
- Thin groups are shown as counts and marked thin, never ranked on a spread they do not have. A ranking with fewer than three non-thin members says so instead of pretending to rank.

## 8. Answer layout, Harvey-style

Harvey's discipline is that the answer comes first and the evidence unfolds beneath it. The Desk today does the reverse: a 60-row table, a 100-bar chart, then the read. New order, on every answer:

1. **Reading card**: the chips, highlighted defaults, and any not-applied notes. Editable in place; a change reruns.
2. **Headline**: one thing, large. A single number with its spread (single-car), the top sale (record), a short ranked list (ranking), two numbers side by side (comparison), or the biggest movers with both windows (trend). Serif, large, with the small change or spread beside it in mono.
3. **Chart**: one chart, capped. Bars show at most 8 groups; the rest fold into "Other (n)" with a "show more" control. Lines show at most 4 series. A chart with more marks than that is not a chart, it is a table drawn badly. The distribution strip stays a sample with "N of M shown". Outliers: any single mark more than 5 times the group median is drawn at the cap line with its value printed, so one $3.9m car cannot flatten the chart; a control switches to log scale. Labels never overlap: rotate, thin or drop ticks before letting them collide. Chart card carries its own window and channel controls and a download.
4. **Table**: top 10 rows by default, sorted by the metric, thin rows folded into one "n thin groups" line, "show more" in steps of 25. The table sorts the same way the chart orders.
5. **The read**: two to four sentences, plain English, a person walking through the headline. Method notes live under "why this read".
6. **Set aside**: one line, expandable: "Set aside: 15 halo, 1 race car, 2 tuner. Show."
7. **Receipts**: the eligible pool, newest first by default, sorted by price for record and ranking questions, excluded rows struck through with a reason, every row linked. 25 at a time.
8. **Coverage footer**: fixed, small mono, always in the same place: window, basis, sources with start dates, thin threshold.

**Comparison layout**: two columns on desktop (left car, right car), stacking on mobile; the same chart type for both with a shared axis; one read that names the gap in words.

**Ranking layout**: the ranked list is the headline; each row has count, median, spread and a thin badge; tapping a row opens that member's single-car answer as a new thread.

**Trend layout**: the movers list with change, both window medians and both counts; the chart is the two-window bars per member, not a time series, unless the user switches to "by month".

**Empty layout**: reading card, a sentence, and widen buttons. No chart, no table.

**The rail** (from the saved design notes): dark ink rail, threads and saved views, Analyst and Leads, org and seat. Every answer is a thread; reopening one restores its reading card.

## 9. Scenario catalogue

Each scenario states the input and the required behaviour. These become golden tests.

**Slang and shorthand**

- "F-body" with no era: expand to all four generations, group by generation, chip shows the expansion.
- "Bird" alone: ask Thunderbird or Firebird. "Bird with a screaming chicken": Firebird Trans Am, no question.
- "993 turbo": Porsche 911 Turbo, 1995 to 1998, no question.
- "E30" alone: ask which E30 (3 Series or M3), or if the user's recent threads are all M3, default M3 with a highlighted chip.
- "Vette C2 split window": 1963 Corvette coupe.
- Typos ("Porshe", "Ferarri", "Camero"): resolve with a highlighted chip showing the corrected name.
- Unknown phrase ("the frog"): honest miss, phrase logged to the review queue, nearest suggestions offered.

**Groupings**

- "90s Japanese sports cars": the curated list shown in full (Supra, RX-7, NSX, 300ZX, 3000GT, MR2, Miata, S2000 from 1999, Skyline where imported, Integra Type R); user can remove members; ranked only after a metric is chosen.
- "Muscle cars under $50k": curated list, price filter as a chip, ranked by count if no metric.
- "Anything air-cooled": air-cooled 911 grouping plus 356 and 914 offered as an optional add.

**Metrics and vagueness**

- "best": one question, four options. "best value": ask compared with what, then run as cheapest relative to the set.
- "rising fastest": median change, 12 vs prior 12 months, both counts shown; members thin in either window shown but unranked.
- "what's a 964 worth": runs as median and spread; the read never says worth.
- "average": answered with median, one line explaining why.

**Filters**

- "under $100k": applied to sale price, chip shown; the chart axis respects it.
- "low-mile 993s": era threshold applied (under 30k), chip shows the threshold.
- "manual only": applied where transmission is recorded; the reading card says how many rows lacked transmission data.
- "concours condition": not applied, stated.
- "sold privately": not applied, stated: our data is auction and platform sales only.

**Comparisons**

- "Z28 vs Trans Am WS6, last 3 years": two pools, side by side, same window.
- "993 or 964": comparison, not a choice question.
- "E30 M3 vs E36 M3 vs E46 M3": three columns, or rows on mobile.
- "Ferrari vs Lamborghini": too broad; ask which models, or offer the top five models of each by count.

**Windows, channels, venues**

- "this year": YTD. "in 2025": calendar 2025. "since Monterey": from the event's end date, chip shows the date.
- "on BaT": source filter. "at the houses": channel house. "at Monterey": event venue with dates, all houses present.
- "last week": if under the thin threshold, say so and offer 30 days.

**Records and extremes**

- "record": highest standard sale since coverage start, coverage dates stated, halo and race cars set aside and listed.
- "cheapest E30 M3 ever": lowest eligible sale, with the data-error floor and parts-lot rules applied, receipt shown.

**Meta and unsupported**

- "what do you cover": the coverage table.
- "will 993s go up next year": refuse honestly; offer the trend answer.
- "should I sell now": refuse the advice; offer trend and where-to-sell (the /sell path).
- "how much is my car worth" with a VIN: runs the VIN through One Box logic, shows sales of cars like it, never a value.

**Robustness**

- Two questions in one sentence: answer the first, offer the second as a next thread.
- A question in another language: translate the reading, answer in English, chip shows the translation.
- The same question twice: identical reading and identical numbers.
- Model outage: the Desk falls back to the current parser for exact nameplates and says the understanding layer is unavailable; it never guesses.

## 10. Agents inside the Desk

"Agent" is the word of the moment, and it only earns its place if it means something specific. The test: **an agent does a job someone does by hand today, repeatedly, that our data can do overnight and hand back with receipts.** It has three parts, all required: a schedule or a trigger, a rule (a threshold, a comparison, a score), and a finished output (a flag, a draft, a PDF). Missing one of the three, it is a saved view, and it is called one.

Every agent runs the same interpreter and DSL as a live question; there is no second engine. Every output carries the reading card, receipts and the coverage footer. Agents prepare, watch and deliver inside the Desk; they never act outside it (no emails on a user's behalf, no bids, no listings). Language rules apply as strictly as anywhere: the Book check says "declared value sits above what cars like it sold for", never "over-valued".

**The agents, by who runs them** (the sentence is the button label)

| Buyer | Run an agent to... | What it does by hand today | Output |
| --- | --- | --- | --- |
| Online platforms (BaT, Cars & Bids, Hagerty Marketplace, PCARMarket) | triage my inbound | A team reads hundreds of submissions a week by hand to decide accept, reserve and pass | Each submission gets the read, the band, the closest sales and a flag (strong, fair, thin, pass), sorted for action; the "Marketplace triage" need Hagerty named on Sep 8 |
| Auction houses (live sales) | check the estimates on my next sale | A specialist builds comps per lot in a spreadsheet for the catalogue | Each lot's estimate against real sales of cars like it, outliers flagged, receipts per lot |
| Houses and platforms | build a consignment pitch | Assembles the evidence pack for a car they are chasing | PDF: band, closest sales by mileage and body, set-asides listed, the best venue and why |
| Houses and platforms | see where we are losing consignments | Post-season guesswork | Segment share by house and platform, this quarter vs last |
| Insurers and lenders | check my book | Nobody re-checks declared or collateral values | Declared vs sold-for band per row, flagged both ways, receipts; the Sep 23 experiment as a product |
| Insurers, houses, platforms | watch a segment for drift | Reads the quarterly guide when it arrives | An alert when a watched scope moves past a threshold or sets a record |
| Dealers and consignors | watch my inventory | Re-prices by feel | Each car on the lot against the market nightly; which are above, which have room, which just got a comparable |
| Dealers and consignors | triage my leads | Reads every /sell submission by hand | Leads mode: the record, a score, a drafted reply, outcome capture |
| Consultancies and PE (engagement licence) | build the market brief for my engagement | An associate's week of spreadsheet work | Segment sizes, movers, venue shares and records over the engagement's window, as aggregates with citation rights |
| Media (citation partners) | write my Monday brief | An analyst's morning | Movers, records, volume by channel, ready to edit, credited to GoAskSam |

**Rules**

- Thresholds and schedules are the user's settings, shown on the agent card.
- An agent that finds nothing says so ("No movers this week for your 12 watched scopes"), never pads.
- Agents are per org, counted against the seat, and appear in the rail under Agents, Harvey-style. In v1 they deliver inside the Desk only (rail notifications, threads, exports); email digests come later.
- Harvey parallel for the design run: the recommended-actions bar at the top of Harvey's Command Center becomes the agent digest at the top of the Desk home: "2 estimates flagged on the Kissimmee catalogue, 1 record set, 14 leads triaged this week."

**Triage my inbound and check the estimates are the same machine.** A list of cars comes in (an inbound queue or a catalogue), and every car gets the read, the band, the closest sales and a flag. Only the source and the volume differ. Market intelligence for the same customers is the Desk itself: Analyst mode, the watch agents and the brief.

**v1 agents (three):** triage my inbound (platforms, and the same screen serves a house's catalogue), build a consignment pitch, check my book. The first is what platforms and houses pay for on day one and is the need Hagerty has already voiced; the second is the live answer as a pack; the third is the Hagerty insurance demo. Watch, inventory, brief and the rest follow once those three prove out, because all of them are the same machinery with a different scope and output.

## 11. The test set

Thirty questions. Each pins the expected reading (chips, defaults, not-applied notes, any clarifying question) and the answer shape. The golden test compares the reading, not only the numbers, so a wrong interpretation fails even when it happens to produce a plausible table.

| # | Question | Expected reading |
| --- | --- | --- |
| 1 | best F-body cars from the 90s | Ask: best by? Then Camaro, Firebird, Trans Am · 1990 to 1999 · ranked |
| 2 | which Fox body Mustangs are rising fastest | Mustang 1979 to 1993 · by model year · median change 12 vs prior 12 · counts shown |
| 3 | air-cooled 911s under $100k sold this year | 911 to 1998 · price under $100,000 · YTD · single read plus receipts |
| 4 | Z28 vs Trans Am WS6, last 3 years | Comparison · Camaro Z28 vs Firebird Trans Am WS6 · 36 months |
| 5 | what 90s Japanese sports cars sold most on Cars & Bids | Grouping list shown · source C&B · ranked by count · 1990 to 1999 |
| 6 | record sale for a BMW M3 | Record · coverage dates · halo set aside |
| 7 | E30 M3s, median by month, three years, houses and online | Single read · by month · 36 months · all channels |
| 8 | 993 turbo, low-mile, last 18 months | 911 Turbo 1995 to 1998 · under 30k miles chip · 18 months |
| 9 | what's a 964 worth | 911 1989 to 1994 · median and spread · read never says worth |
| 10 | Bird from the 70s | Ask: Thunderbird or Firebird? |
| 11 | Bird with a screaming chicken | Firebird Trans Am · no question |
| 12 | which house sold the most Lussos in the last two years | 250 GT Lusso · by venue · house channel · 24 months |
| 13 | Ferrari vs Lamborghini | Ask which models, or top five each by count |
| 14 | cheapest E30 M3 ever | Lowest eligible sale · coverage dates · floor and parts rules applied |
| 15 | muscle cars under $50k on BaT | Grouping shown · price filter · source BaT · ranked by count |
| 16 | how many E30 M3s resold since 2023 | Repeat sales · since 2023-01-01 |
| 17 | Corvette C2 split window | 1963 Corvette coupe · single read |
| 18 | manual 997 GT3s this year | 911 GT3 2005 to 2012 · transmission manual · YTD · rows lacking transmission counted |
| 19 | Porshe 356 speedster | Corrected name chip · 356 Speedster |
| 20 | concours condition E-Types | E-Type · not applied: condition · single read |
| 21 | is the Testarossa market softening | Testarossa · median change 12 vs prior 12 · read in words |
| 22 | Defender 90 NAS, this year vs last year | Comparison of windows · same scope |
| 23 | what sold at Monterey this year over $1m | Venue event · price over $1m · YTD · ranked by price |
| 24 | should I sell my 993 now | Refuse advice · offer trend and /sell path |
| 25 | what will 993s be worth next year | Refuse prediction · offer trend |
| 26 | what do you cover for Mecum | Coverage table row |
| 27 | WDBNG79J36A477562 | VIN read · W220 S65 · sales of cars like it |
| 28 | E30 vs E36 vs E46 M3 | Three-way comparison |
| 29 | anything sold last week for a Duesenberg | Model J family · 7 days · thin, offer 30 days |
| 30 | the frog | Honest miss · logged · suggestions |

The set grows from the review queue: every corrected chip and every answered clarification becomes a candidate test.

## 12. Build sequence, gates and open decisions

Each stage stops at a gate with production screenshots and the golden set green. Nothing in a later stage starts before the gate passes.

| Stage | Builds | Gate |
| --- | --- | --- |
| A. Dictionary v1 and validator | The dictionary file with platforms, nicknames, eras, windows, channels, venues, price and mileage phrases, and the first 10 groupings; the validator against resolver, generations and archive; the review queue table | Every dictionary entry expands to real archive scope; the five failed questions all read correctly in the reading step (no answers yet) |
| B. Interpreter and reading card | The model call with the dictionary and DSL schema; structured output; phrase fates; the reading card with editable chips; clarifying question UI; the no-silent-drops golden | All 30 test readings match; determinism check (same question, same reading, 3 runs) |
| C. New question types in the DSL | Ranking, trend, comparison, price and mileage and transmission filters, venue events | Test questions 1 to 5, 8, 15, 18, 22, 23, 28 answer correctly with receipts |
| D. Answer layout | Headline first, capped charts with Other and outlier handling, top-10 tables with show more, empty state, set-aside line, coverage footer | The Fox body and air-cooled questions render on one screen without scrolling to find the answer |
| E. Design run | Rail, threads, two-column desktop, Harvey references, type and colour rules from the saved notes | Sam's review against live renders |
| F. Agents v1 | Check the estimates (catalogue upload, per-lot read, flags) and Build a consignment pitch (the live answer as a PDF pack) | A 20-lot test catalogue runs end to end with flags and receipts; a consignment pitch exports for one car |
| G. Leads mode and Book check | Leads mode (Stage 3 as planned) and Check my book, the Hagerty demo agent, using a 20-car book built from HVT tiles | A real /sell lead flows through triage; a 20-row book check runs end to end |

Two additions to the sequence from sections 14 to 16: the nightly aggregates (section 15) are built at the start of stage C, because rankings, trends and comparisons are unusable at 30 seconds a question; and the neutrality rules (section 14) are written into CLAUDE.md at stage A so every later stage is checked against them. Vercel Pro and the Desk's own function go in before stage E's review, since the design run means Sam clicking through heavy questions, and before any demo.

**Decisions taken (Sam, Sep 24)**

1. Clarifying questions are answered in the chat, with tap options offered as a shortcut (section 6).
2. Low-mile thresholds by era stay as drafted.
3. Groupings: CC drafts the first ten lists, Sam approves each before it is marked approved in the dictionary.
4. Ambiguity resolves from the user's recent behaviour first, and the user can change anything by chatting back (section 7).
5. Agents in v1 deliver inside the Desk only.
6. "Average" is answered with the median and a one-line note. No means.
7. The Hagerty demo agent is the Book check, with Watch shown alongside. Reason: the Book check is the Sep 23 experiment turned into a product, it speaks to Ro's revenue and claims angle and Mark Elliott's risk angle in one screen, and it needs no integration on Hagerty's side beyond a CSV. For the demo we build the book ourselves: 20 cars with declared values taken from the HVT tiles, so nobody has to hand over real policy data.

## 13. Exports and data protection

The risk Sam raised: a customer exports everything in month one and cancels. The answer is partly product design and partly what we sell.

- **Exports are answers, not the archive.** Every export is the result of one question: the answer table plus its receipts, capped (300 receipts in the table, 500 in the distribution sample), watermarked with org, seat and date. There is no bulk export, no "all sales for a make", and no API in v1.
- **Caps per seat.** A daily export allowance per seat (for example 20 exports and 5,000 receipt rows a day), visible on the seat page, with a plain message when it is reached. Agencies and media get a higher tier, not an unlimited one.
- **Fresh beats stored.** The archive updates every night, agents run on the new data, and coverage dates move daily. The product's value is the current read, the interpretation and the agents, not the rows. The coverage footer states "updated nightly" so that the freshness is visible on every answer.
- **Terms.** The seat agreement says exports are for the org's internal use and may not be resold or republished as a dataset. Watermarks make a leaked export traceable to a seat.
- Engagement licences are the exception by design: a consultancy gets a higher aggregate-export allowance for a fixed term, never receipts in bulk, never the archive, and always with citation. **Watch the pattern.** Export volume per seat is logged; a seat that exports at the cap every day in its first weeks is a conversation, not a block.

## 14. The market, the pain, and neutrality

**What exists today, and what each one is**

| Product | What it does well | What it does not do |
| --- | --- | --- |
| Classic.com | Browse sold listings; a per-model benchmark number and a scatter chart; an AI listing-search beta | One basis across venues; specials set aside; receipts under a read; anything for a house or an insurer; neutral (it sells into Hagerty's insurance funnel) |
| Hagerty Valuation Tool | Condition-tiered values, a trusted name, quarterly editions | Car-level evidence; anything between editions; independence (Hagerty owns a marketplace and a house) |
| Hammer Price (Motorsport Network) | Lot tracking, alerts, a dealer and analyst tier | Cross-house comparison on one basis; a read; neutrality (media group owner) |
| Bring a Trailer results | Deep in its own sales | Anything outside BaT |
| BidBetter and similar | Per-listing buyer help on three platforms | The record; houses; business workflows |
| Sports Car Market, K500, Glenmarch | Expert commentary, an index, UK coverage | Query in plain English; agents; receipts on demand |
| OldCarsData itself | The raw feed, an API, an MCP server | Canonical dedupe, hammer basis, set-asides, judgment; it sells rows, we sell answers |

**The pain, as customers have said it to us**

- Hagerty (Sep 8): marketplace triage of incoming listings, a critique of the valuation tool's lag, and interest in natural-language analytics.
- Dealers via Ingo: a results tool for their clients and competitor pricing intelligence.
- Houses: specialists building comps per lot by hand; consignors arguing reserves; nobody with the cross-house view.
- Clint: the 70% of sales that are private and invisible, which we state as a limitation rather than hide.

**Neutrality rules (Switzerland)**

1. Every venue is read on the same basis (hammer, premiums backed out) with the same set-aside rules. No venue gets a different floor, window or exclusion.
2. B2B revenue never touches any ranking, read or recommendation. A house that pays for seats is treated exactly as one that does not. This generalises the existing Broad Arrow and Hagerty neutrality rule and is stated in the seat agreement.
3. Tenant isolation: one org never sees another org's questions, threads, uploads (catalogues, books) or exports. Uploaded data is the org's and is deleted on request.
4. Methodology is published: basis, windows, thin threshold, set-aside rules, coverage per source. Any customer can see how a number was made.
5. Coverage honesty: what we do not hold (private sales, condition, pre-coverage years) is stated on every answer, not in a footnote nobody reads.
6. New sources plug in through one table (source, channel, basis, fee schedule, coverage start) so adding a venue never changes how existing venues are read.
7. /sell's venue recommendation is a separate product with its own rules; the Desk states facts and never recommends a venue unless the question asks "where", and then it shows the numbers behind the answer.

## 15. Speed: five seconds, and how

The bar is typing or speaking a question and seeing the answer in about five seconds. Today heavy questions take 30 seconds because every answer is computed from raw rows. Harvey, Perplexity and every fast product feel instant because the heavy work is done before the question arrives.

- **Nightly aggregates (the cube).** After the nightly ingest and relink, precompute for every make, model and generation: count, median, quartiles, min, max, newest, set-aside counts, and channel split, for the standard windows (YTD, 12, 24, 36 months) and by year, month, venue and channel. Most questions are then a lookup, not a scan.
- **Raw scan only when needed.** Unusual filters (a price cap, a mileage band, a custom window) fall back to the row scan, with a progress state that says so.
- **Reading step under two seconds.** One model call, small prompt, cached readings for repeated questions.
- **Budget per question.** Reading 2s, lookup 1s, render 1s. Anything over 8s shows a plain "still working" state, never a spinner alone.
- **Voice.** The chat box accepts speech (browser speech-to-text), and the reading card confirms what was heard before running, so a misheard "993" as "996" is caught on the card.
- **Vercel Pro and its own function** (api/desk.js) before the design run, so timeouts stop masking real behaviour.

## 16. What we borrow, and from whom

Harvey is the reference for feel, but four other products solve pieces of this better than Harvey does.

| Product | What to take | Where it lands |
| --- | --- | --- |
| Harvey | Answer-first threads; a dark rail with recents, saved views and agents; quiet chrome; the recommended-actions digest on the home screen | Layout, rail, agent digest (section 8, 10) |
| Hebbia | The matrix: rows are documents, columns are questions, every cell cites its source | The catalogue check and the book check: rows are cars, columns are the read, the band, the flag, each cell with receipts |
| Perplexity | Citations inline with the answer; the answer never floats free of its sources | Receipts under every number; the read links to the sales it names |
| AlphaSense | Watchlists, alerts and saved searches for analysts; exports built for decks | Watch agents; chart and table exports sized for a slide |
| Linear | Speed and restraint; keyboard first; nothing decorative | The five-second bar; chart caps; empty states in words |

**Naming.** In sales language the word is "agents", because that is what buyers now look for. In the product each agent is named by its job ("Check the estimates", "Check my book") so the label says what happens, not what it is. The rail heading can say "Agents"; the buttons never do.
