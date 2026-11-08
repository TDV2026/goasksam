# GoAskSam 2.0: Market Check and Sell Design Implementation

## Project objective

Bring Market Check and Sell into the same approved design system as the new GoAskSam Homepage, Find and Tasks pages.

We are building one coherent product with four distinct capabilities:

- **Find:** Discover vehicles currently listed across multiple auction platforms.
- **Market Check:** Understand what comparable vehicles have actually sold for, with supporting transactions and market evidence.
- **Sell:** Understand where and how to sell a vehicle, including auction-platform recommendations and PowerSeller options.
- **Tasks:** Have Sam continue looking for matching vehicles and monitor individual cars.

The new Homepage, Find and Tasks designs are approved.

**Do not redesign those pages as part of this project.**

This implementation has two distinct scopes:

1. **Market Check and Sell entry pages:** Redesign to match the approved visual language.
2. **Market Check and Sell results pages:** Preserve the current content, layouts, calculations, recommendations, charts and functionality. Replace only the surrounding header, left rail, footer and necessary responsive layout constraints.

The results are already substantial, functioning products. We do not want them rebuilt.

---

# PART 1: SHARED GLOBAL DESIGN

## 1. Global header

Use the exact shared header already approved and implemented on Find.

It must be identical across:

- Homepage
- Find entry and results
- Market Check entry and results
- Sell entry and results
- Tasks

### Header appearance

- Dark forest-green background.
- GoAskSam logo positioned on the left.
- Small Beta badge next to the logo.
- Navigation positioned on the right.
- Cream rounded pill indicating the active section.
- Consistent height, font sizes, spacing and padding.

Navigation:

**Find | Market Check | Sell | Tasks | Account**

The active section remains highlighted on both its entry and results pages.

Do not introduce a different header for results pages.

Do not change the approved Homepage, Find or Tasks styling.

### Important

Remove the old primary-navigation sidebar currently visible on Market Check and Sell.

The old sidebar contains Home, Find, Market Check, Sell and Tasks.

Those destinations now belong exclusively in the global top navigation.

There must not be two competing navigation systems.

---

## 2. Shared left workspace rail

Market Check and Sell must use the exact same left-rail component as Find.

The left rail is for current work and recent activity, not product navigation.

### Find reference

The current Find rail contains:

**+ New search**

And recent searches when available.

Keep Find unchanged.

### Market Check left rail

At the top:

**+ New check**

Below, when available:

**Recent Market Checks**

Each recent entry should display a recognizable vehicle query and reopen the corresponding result where supported.

Examples of labels:

- 1995 Porsche 911
- 2006 Ford GT
- 2020 BMW M3

These are illustrative labels only, not entries to hardcode.

### Sell left rail

At the top:

**+ New analysis**

Below, when available:

**Recent selling analyses**

Each entry should reopen the corresponding existing Sell result where supported.

### Left-rail design

Match Find exactly:

- Same width.
- Same distance from the viewport edge.
- Same background.
- Same vertical divider.
- Same button treatment.
- Same typography.
- Same spacing.
- Same responsive collapse behavior.

Do not build separate sidebar implementations for each section.

Use a shared component configured for the active product.

### Recent activity behavior

Use existing recent-query history and persistence where supported.

Do not introduce new database tables, authentication changes or persistence mechanisms just to fill the sidebar.

If no relevant recent activity exists, leave the rail minimal.

Do not fill it with promotional copy.

Clicking a recent item should restore its existing search or result context, rather than opening an unrelated generic page.

### New buttons

**+ New check** returns Market Check to its empty entry state.

**+ New analysis** returns Sell to its empty entry state.

Starting a new analysis must not delete previous history.

---

## 3. Global footer

Use the exact approved charcoal footer from the Homepage and Find pages.

Links:

About | For business | The Daily Vroom | What's new | Feedback | Terms | Privacy

GoAskSam branding and copyright should follow the existing shared footer component.

Apply it to Market Check and Sell entry and results pages.

Do not repeat footer links inside the left rail.

The footer should:

- Follow page content naturally.
- Appear after the final results section.
- Never cover results or sticky controls.
- Maintain consistent spacing and styling.
- Work correctly on desktop, tablet and mobile.

---

## 4. Shared visual design

Use the approved GoAskSam design tokens:

- Warm cream page backgrounds.
- Dark forest-green primary actions.
- Cream active navigation pill.
- Elegant serif typography for main headings and Sam's editorial voice.
- Readable sans-serif for interface text.
- Clear, consistent numerical typography for prices.
- Subtle borders.
- Consistent card radii.
- Restrained shadows.
- Generous but deliberate spacing.

The results pages should not become overly minimal just to match the Find landing page.

A research results page naturally contains more information than a search entry page.

**Consistency means the same surrounding interface and visual language, not identical content density.**

---

# PART 2: MARKET CHECK ENTRY PAGE

## 5. Market Check entry experience

Redesign the current empty Market Check page to match the approved Find empty state.

The page should have the same overall structure:

Shared header, left rail, main hero, search input, example chips, compact evidence demonstration and shared footer.

### Eyebrow

**MARKET CHECK · COMPLETED SALES**

Use the existing uppercase forest-green styling.

### Main headline

**What have cars like yours sold for?**

Keep this exact wording.

It is direct, approachable and explains the purpose.

Use the same serif style and visual scale as the Find headline.

### Supporting copy

Use:

**Explore actual completed sales, with the individual transactions behind every result.**

Avoid repeating the headline.

### Search input

Use the same component as Find.

- Same width and height.
- Same border and radius.
- Same microphone placement.
- Same green submit arrow.
- Same spacing.
- Same keyboard behavior.

Placeholder:

**e.g. 2001 BMW M3 manual**

This is placeholder text, not a prefilled query.

Submission must use the existing Market Check search engine and route to the existing results page.

### Trust statement

Below the input:

**Completed sales only. Every result links to its source.**

Do not show an updated-date label on the empty entry page.

Freshness information belongs with actual results.

### Example search chips

Use the same chip design as Find.

Three examples:

1. 2001 BMW M3 manual
2. 2018 Porsche 911 GT3
3. 2006 Ford GT

Each chip should execute the corresponding existing Market Check query.

These are natural-language examples, not filters.

### Evidence demonstration

Add a compact section below the search area.

Heading:

**The sales behind the numbers**

Show three real completed auction sales for one model.

The purpose is to show that Market Check provides underlying transactions, not merely a headline number.

Each card contains:

- Real vehicle photograph.
- Year, make and model.
- Actual completed selling price.
- Mileage.
- Selling platform.
- Sale date.

Each card must open the original completed auction transaction.

### Evidence selection requirements

Use existing verified GoAskSam data.

All three cars must be relevant to the same market example.

Do not randomly combine unrelated transactions.

Prefer a group that demonstrates how mileage, specification or condition can produce different selling results.

Do not invent details.

If appropriate verified data cannot be retrieved, omit the example rather than displaying fabricated sales.

### Presentation

Use three compact cards in one row on desktop.

The demonstration must remain secondary to the search input.

Do not add:

- Charts.
- Trend lines.
- Confidence scores.
- Full filtering interfaces.
- Extra explanatory sections.
- Multiple promotional CTAs.

### Page height

Do not force large empty areas beneath the example cards.

Use normal document flow and approximately 60 to 80px of bottom breathing room before the footer.

---

# PART 3: MARKET CHECK RESULTS

## 6. Protected results experience

**The attached full-page 1995 Porsche 911 Market Check screenshot is the authoritative reference for the current results experience.**

The additional BMW M3 and Ford GT screenshots illustrate other existing result states.

These results must not be redesigned.

Treat the entire Market Check results component as protected.

### Only intended visible changes

1. New shared global header.
2. New shared left workspace rail.
3. New shared footer.
4. Necessary container-width and responsive adjustments so the content fits properly.

Everything else remains as it is.

### Preserve the results search input

Keep:

- Current vehicle query.
- Editable search field.
- Search submission.
- Existing refinement behavior.
- New-search functionality.

Do not introduce a second competing input.

### Preserve the vehicle summary

Keep the existing:

- Market Check label.
- Vehicle title.
- Model year.
- Generation or comparison scope.
- Latest sale date.
- Explanation of any substitutions or expanded comparison population.

For example, when 2020 BMW M3 results use 2021 sales, the distinction must remain clearly visible.

Do not change the evidence selection logic as part of styling.

### Preserve the main result card

Keep:

**WHAT THESE SELL FOR**

And all existing information:

- Typical completed-sales range.
- Number of supporting sales.
- Analysis period.
- Gearbox or other relevant qualification.
- Limited-data notices.
- Last-updated information.
- How Sam Decides link.

Preserve the exact calculations and underlying methodology.

Do not describe the range as a valuation or guaranteed future selling price.

### Preserve narrowing and refinement

The current results support relevant controls such as:

- Manual or DCT.
- Coupe or Cabriolet.
- Mileage refinement.

Keep all existing options and their dynamic counts.

Preserve the same refinement logic and result transitions.

Do not introduce a new filter dashboard.

### Preserve Latest Sales

The upper results area includes the latest completed-sale transactions.

Keep:

- Transaction rows.
- Vehicle photographs.
- Date.
- Vehicle description.
- Mileage.
- Venue.
- Completed price.
- View-all functionality.

Keep the current order and display logic.

### Preserve Sales Behind This Answer

The 1995 Porsche 911 result includes three selected sale photographs explaining the range.

Keep this entire section.

Preserve:

- Section heading.
- Supporting explanation.
- Three selected evidence cars.
- Actual completed prices.
- Mileage.
- Venues.
- Dates.
- Links to all sales.
- How Sam Picked These.

Do not replace it with a generic three-card demonstration.

This is an existing evidence feature, not an entry-page marketing component.

### Preserve Live Right Now

Keep the current live-comparison section and its data.

Preserve:

- Vehicle.
- Auction platform.
- Last bid seen.
- Time information.
- Relationship to the completed-sales range.
- Auction links.

A current bid is not a completed selling price.

Retain that distinction.

### Preserve Comparable Sales

Keep the complete table of completed transactions.

Preserve:

- Dates.
- Vehicle descriptions.
- Mileage.
- Venues.
- Actual prices.
- All existing sorting and expansion behavior.
- Show More Sales.
- Receipt links.

Do not truncate or remove transactions merely to make the page shorter.

### Preserve How This Market Is Distributed

The 1995 Porsche result includes the distribution of completed sales across price bands.

Keep this chart exactly as a product feature.

Preserve:

- Existing statistical method.
- Price bands.
- Sales counts.
- Percentages.
- Labels.
- Data window.
- Visual explanation.

Do not replace it with another chart type.

### Preserve historical market charts

The Ford GT example demonstrates a different existing state:

**How this market has moved**

Keep the chart when the current product logic supports it.

Preserve:

- Quarter labels.
- Historical typical ranges.
- Median markers.
- Sample counts.
- Excluded periods.
- Explanatory text.
- Comparison periods.

Do not force a chart onto every result.

Do not change the calculation, chart windows or result-selection rules.

### Preserve lower-page actions

Keep:

- Ready to Sell CTA.
- See Where Sam Would Sell It.
- Task notification CTA.
- Have Sam Keep Looking.
- Sign-in behavior.
- Supporting descriptions.
- Existing links and actions.

Maintain the existing cross-product workflows.

### Maintain section order

The full 1995 Porsche 911 result currently contains:

1. Search query.
2. Vehicle summary.
3. Main range and refinements.
4. Latest sales.
5. Sales behind this answer.
6. Live right now.
7. Comparable sales.
8. Market distribution.
9. Sell CTA.
10. Task notification CTA.

Preserve the current section order and conditional rendering.

Different vehicle results may show different evidence sections.

Do not artificially force every result into the same template.

### Layout integration

Market Check should retain its existing internal structure, including:

- Two-column upper results area.
- Full-width supporting sections below.
- Evidence grids.
- Tables.
- Charts.

Place the existing result component inside the new workspace shell.

Do not leave the results unnecessarily narrow.

The screenshot shows a narrow content presentation with significant unused horizontal space.

Within the new shell, allow the component an appropriate responsive maximum width, using the available content space to the right of the sidebar.

However, do not change the internal grid structure or visual hierarchy.

Only adjust outer container widths, padding and breakpoints where needed.

### Mobile behavior

Preserve existing responsive stacking.

Ensure:

- Range remains readable.
- Latest sales can be inspected.
- Tables remain usable.
- Charts do not overflow.
- Buttons remain accessible.
- The new navigation and sidebar do not interfere with the results.

---

# PART 4: SELL ENTRY PAGE

## 7. Sell entry experience

Redesign the existing Sell empty state to match the approved Find and new Market Check entry pages.

### Eyebrow

**SELL · SELLING INTELLIGENCE**

### Main headline

**Where should you sell your car?**

Keep this exact wording.

### Supporting copy

Use:

**See where similar cars have sold, how different auction platforms perform and what the evidence suggests for your car.**

### Input

Use the same shared search component as Find.

Placeholder:

**e.g. 2006 BMW M5**

Keep:

- Natural-language input.
- Microphone.
- Green submit arrow.
- Existing Sell query routing.
- Existing clarification behavior.

### Benefit line

Below the input:

**Platform performance · Selling strategy · PowerSeller options**

Do not show a generic updated-date label on the entry page.

### Example chips

Use three:

1. 2006 BMW M5
2. 2004 Porsche 911 Carrera
3. 1994 Toyota Land Cruiser

Clicking a chip should run that search through the existing Sell product.

### Optional evidence demonstration

Heading:

**Different cars. Different ways to sell.**

If existing verified Sell data supports it, display a compact example of observed auction-platform performance for a particular model.

The example should show why GoAskSam's guidance is based on relevant actual results.

It must not imply that a platform guarantees a higher selling price.

Do not fabricate comparisons, rankings or selling probabilities.

If a clean and compelling verified example is unavailable, omit this section rather than introducing misleading content.

Keep the entry page short.

The search input should remain the primary action.

---

# PART 5: SELL RESULTS

## 8. Protected Sell results experience

**The attached full-page 2004 Porsche 911 Carrera Sell results screenshot is the authoritative reference for current Sell functionality and content.**

Preserve the existing Sell experience.

Do not rebuild its recommendations, evidence or lead-generation workflows.

### Only intended visible changes

1. New shared dark-green header.
2. New shared left workspace rail.
3. New shared footer.
4. Outer container width and responsive adjustments needed for the new shell.

Keep all results content and functionality.

### Search query

Keep the editable vehicle search at the top.

Preserve the existing query text and refinement capability.

### Primary platform recommendation

The current results include Sam's main recommendation.

For example:

**Sam would sell your Porsche on Bring a Trailer**

Keep:

- Existing recommendation.
- Platform name.
- Supporting explanation.
- Why Sam Picked This.
- Actual supporting evidence.
- Platform-specific statistics.
- Listing CTA.
- Existing links and actions.

Do not change the platform selected by the recommendation engine.

Do not modify the analysis window or underlying calculations.

### PowerSeller recommendation

Preserve the separate PowerSeller recommendation.

Keep:

- Named recommended PowerSeller.
- Explanation of why Sam recommends them.
- Existing experience and track-record information.
- Geographic relevance.
- Contact form.
- Submission flow.
- Supporting qualification text.

Do not remove the PowerSeller recommendation simply because it adds length.

This is an important differentiator in Sell.

Do not fabricate or alter historical performance claims.

### Completed-sales range

Keep the existing:

**WHAT THESE SELL FOR**

Preserve:

- Observed completed-sales range.
- Number of comparable sales.
- Model and generation scope.
- Analysis period.
- Limited or excluded evidence notes.
- Link to full Market Check.
- How Sam Decides.

This is supporting market evidence.

Do not present it as a guaranteed selling price.

### Latest completed sales

Preserve the existing photograph-led sale cards.

Keep:

- Actual photos.
- Prices.
- Auction venues.
- Dates.
- Vehicle specifications.
- Original receipt links.

Preserve their existing logic and order.

### Other Sell states

The design must work when:

- One platform clearly has stronger supporting evidence.
- Evidence is mixed.
- Only a limited number of comparable sales exists.
- A PowerSeller is not available.
- The user asks about reserves.
- A model spans different specifications or generations.
- Existing logic requests clarification.

Do not replace those states with generic recommendations.

### Layout

The current Sell results page is relatively narrow.

Use the available workspace width more effectively, without restructuring the actual recommendation cards.

Preserve the existing results sequence:

1. Editable query.
2. Platform recommendation.
3. PowerSeller recommendation.
4. Completed-sales range.
5. Latest completed sales.
6. Any additional existing supporting sections.
7. Footer.

The main recommendation and PowerSeller cards may retain their current internal split-column layouts.

Only adjust outer width and responsive constraints.

---

# PART 6: ROUTING AND WORKFLOW PRESERVATION

## 9. Cross-product behavior

The new design must not break navigation between products.

### Homepage to Market Check

When a homepage query is intended for Market Check, preserve the query and open the existing Market Check results.

### Homepage to Sell

When a homepage query is intended for Sell, preserve the query and open the existing Sell results.

### Find to Market Check

Links from Find listing cards to Market Check must continue working.

Preserve vehicle context wherever supported.

### Market Check to Sell

The Ready to Sell CTA must continue opening the relevant Sell analysis.

Preserve the vehicle query.

### Market Check to Tasks

Have Sam Keep Looking must preserve the vehicle or search context through the existing Task creation flow.

### Sell to Market Check

Supporting evidence links must continue opening the full Market Check result.

### Authentication

If login is required for any action, preserve the user's pending action and query through authentication where already supported.

Do not introduce regressions in saved search, Task, lead or contact flows.

---

# PART 7: RESPONSIVE IMPLEMENTATION

## 10. Desktop

Use the Find layout as the reference for:

- Header.
- Sidebar.
- Main content gutters.
- Footer.

Allow Market Check and Sell results enough horizontal room for their existing content.

Avoid large unused areas if they make the information appear artificially compressed.

However, retain sensible maximum widths for readability.

## 11. Tablet

Use the approved responsive navigation.

Ensure the sidebar does not force charts, tables or recommendation cards into unusably narrow columns.

Stack internal columns when needed.

## 12. Mobile

The experience must remain usable at approximately 390px width.

Requirements:

- Responsive shared header.
- Accessible navigation.
- Sidebar collapsed or presented using the approved mobile behavior.
- Readable headings.
- Full-width search inputs.
- Usable refinement chips.
- Responsive result cards.
- No clipped prices.
- No horizontal page overflow.
- Tables handled with an intentional responsive strategy.
- Market charts remain legible.
- PowerSeller contact actions remain usable.
- Footer follows the content.

Do not remove evidence or functionality on mobile merely to simplify the interface.

---

# PART 8: DATA AND PRODUCT INTEGRITY

## 13. Protected functionality

Do not modify any of the following:

- Auction data ingestion.
- Historical transaction records.
- Search interpretation.
- Comparison population selection.
- Completed-sales calculations.
- Typical range methodology.
- Historical chart calculations.
- Distribution calculations.
- Recency weighting.
- Sell platform rankings.
- PowerSeller matching.
- Reserve guidance.
- Authentication.
- Notification logic.
- Task matching.
- Recent activity persistence.
- Auction receipt links.
- Contact forms.
- Existing APIs.
- Database schemas.

No unnecessary new dependencies.

This is a design and presentation integration project.

### Avoid semantic regressions

Never change:

- Current bids into completed sales.
- Historical prices into valuations.
- Insufficient evidence into fabricated estimates.
- Comparisons across different generations without explanation.
- Unsuccessful auctions into successful transactions.
- Unsupported recommendations into definitive claims.

Any qualification currently displayed must remain.

---

# PART 9: IMPLEMENTATION PROCESS

## 14. Implementation order

Work in this sequence.

### Step 1: Audit existing pages

Identify the current Market Check and Sell entry and results components.

Identify the approved shared components from Find.

Document which files control:

- Shared header.
- Workspace rail.
- Footer.
- Main layout.
- Market Check entry.
- Market Check results.
- Sell entry.
- Sell results.

Do not start by rewriting the result components.

### Step 2: Implement the shared shell

Apply the new header, sidebar and footer to both Market Check and Sell.

Check entry and results pages before moving on.

### Step 3: Redesign the two entry pages

Implement the new copy, inputs, example chips and verified demonstration sections.

Do not change existing search routing.

### Step 4: Fit existing Market Check results into the new shell

Preserve the 1995 Porsche full-results experience as the regression reference.

Check the BMW M3 and Ford GT result variations.

### Step 5: Fit existing Sell results into the new shell

Preserve the 2004 Porsche Sell result as the regression reference.

Verify PowerSeller and platform recommendation flows.

### Step 6: Test responsive behavior

Test desktop, tablet and mobile.

### Step 7: Regression verification

Compare before and after.

Every existing result section, number, chart and interaction should remain present and functional.

---

# PART 10: ACCEPTANCE CRITERIA

## 15. Shared design

- Same global header across all pages.
- Same GoAskSam logo and Beta badge.
- Same top navigation.
- Same active-page treatment.
- Same left rail design.
- Same footer.
- No duplicate primary navigation.
- Consistent spacing and typography.

## 16. Market Check entry

- New approved visual design.
- Existing headline retained.
- Updated supporting copy.
- Shared search component.
- Three working example chips.
- Compact verified completed-sales demonstration.
- Footer immediately follows natural content spacing.

## 17. Market Check results

Verify the 1995 Porsche 911 example retains:

- Main completed-sales range.
- Model-year and comparison scope.
- Body-style and transmission controls.
- Mileage refinement.
- Latest sales.
- Sales Behind This Answer.
- Live Right Now.
- Comparable Sales table.
- Show More.
- Market distribution chart.
- Sell CTA.
- Task CTA.

Also verify:

- BMW M3 results with year substitution.
- Ford GT results with the historical market chart.
- Insufficient-data states.
- Different sale counts and comparison scopes.

## 18. Sell entry

- New approved visual design.
- Existing headline retained.
- Updated supporting copy.
- Shared search component.
- Three working example chips.
- Verified evidence preview if appropriate.
- No excessive blank space.

## 19. Sell results

Verify the 2004 Porsche 911 Carrera example retains:

- Recommended platform.
- Why Sam Picked This.
- Listing CTA.
- PowerSeller recommendation.
- PowerSeller statistics.
- PowerSeller contact form.
- Completed-sales range.
- Market Check link.
- Latest sales photographs.
- Original auction links.

Also test limited-evidence and no-PowerSeller states.

## 20. Navigation and regression

- All cross-product links work.
- Query state is preserved.
- Authentication flows work.
- Existing calculations remain identical.
- No data or functionality is lost.
- Desktop, tablet and mobile layouts work.
- No page overflow or clipped results.
- Shared footer is visible and unobstructed.

---

# FINAL INSTRUCTION

**The results pages are the product. The surrounding interface is what we're changing.**

Do not rebuild the existing Market Check or Sell results to make them visually match Find.

Find is for discovery. Market Check is for research. Sell is for a selling decision.

They require different content structures, but they must share the same GoAskSam identity and navigation.

Preserve the evidence, charts, recommendations, calculations and user workflows exactly as they work today.

Redesign only the two entry pages and integrate the existing results into the approved shared application shell.

The finished experience should feel like one premium GoAskSam product, not separate applications that happen to use the same colors.
