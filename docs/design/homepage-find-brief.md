# GoAskSam: Complete Homepage and Find Page Design Corrections

I want you to complete a thorough design and consistency pass across the GoAskSam Homepage and Find page.

We've been through several iterations, and the latest versions still don't match the quality or consistency of the approved mockups.

**This is not a request for another redesign or a collection of alternative concepts. I want the existing pages corrected and finished.**

The Homepage and Find page must look and feel like two parts of the same premium product.

Use the previously approved mockups as the primary visual references. Use the latest screenshots to identify the regressions and inconsistencies.

The overall aesthetic should be:

- Premium and sophisticated
- Clean and editorial
- Calm, confident and trustworthy
- Simple and immediately usable
- Consistent across every page
- Automotive without looking like a conventional car classifieds website

The experience should combine the simplicity of ChatGPT with the visual quality of an established premium automotive publication.

Do not introduce unnecessary elements, new product concepts or generic SaaS styling.

## 1. Establish one shared design system

Before making individual page changes, fix the common design system.

Both pages must use identical:

- Brand colors
- GoAskSam wordmark
- Beta label
- Header height
- Navigation typography and spacing
- Serif and sans-serif fonts
- Search bar components
- Search icons
- Microphone controls
- Submit buttons
- Example pills
- Button shapes
- Border radii
- Footer
- Hover, focus and active states

Create or reuse shared components and design tokens wherever possible.

**Do not maintain separate versions of the same component for Homepage and Find.**

Moving between these pages should feel completely seamless.

## 2. Header and branding

The header must be identical across both pages.

In the upper-left corner, display:

**GoAskSam [Beta]**

The Beta label should sit immediately alongside the wordmark.

It should be small, subtle and understated, using a refined outlined pill or equivalent treatment.

The GoAskSam logo should use the correct approved serif font.

Remove:

**FIND · CHECK · SELL**

We don't need this beside the logo, and we have already agreed not to use "Check" as an independent product label.

The navigation should be:

**Find | Market Check | Sell | Tasks | Account**

Use the appropriate signed-in or signed-out account state.

Don't show different navigation treatments merely because the pages have been implemented separately.

The header should have:

- Identical height across both pages
- Consistent padding
- Correct wordmark sizing
- Proper vertical alignment
- Balanced navigation spacing
- A restrained active-page indicator
- Professionally styled account controls

The active Find state should be visible but not oversized.

Restore the extremely subtle top-edge treatment from the approved mockup. This is a very slight visual detail, not a prominent announcement banner.

## 3. Color corrections

The current green is too light.

Use the deeper, richer forest green from the approved design.

It should feel luxurious and sophisticated, approaching black in darker areas without becoming flat black.

Avoid bright emerald, teal or oversaturated green.

The same green system must carry through:

- Homepage hero
- Shared header
- Primary buttons
- Search submit button
- Links and accents
- Selected states

Keep the background of the main content areas a subtle, warm cream.

Avoid bright white backgrounds across entire sections where the design calls for cream.

Do not introduce orange.

The green submit button in the current screenshots is the correct brand direction. It simply needs refinement.

## 4. Typography

Typography is one of the largest weaknesses in the current implementation.

The font choices, weights, proportions and spacing are inconsistent.

Use the exact approved font families where those assets are available.

One elegant serif family should be used for:

- GoAskSam wordmark
- Large hero headlines
- Page titles
- Major editorial headings
- Real-sales storytelling

One complementary sans-serif family should be used for:

- Navigation
- Body copy
- Buttons
- Search fields
- Sidebar
- Pills
- Supporting descriptions
- Labels

Review every font weight, line height, letter spacing and heading size.

Avoid excessively heavy sans-serif text.

Avoid oversized serif headlines that dominate the layout.

The typography should look deliberate and expensive, not like a default component library.

Establish reusable type styles rather than manually choosing sizes in individual sections.

## 5. Homepage hero

Keep the main headline:

**One search. Multiple auction platforms.**

Supporting copy:

**Find your next car. See real sales. Discover where to sell.**

This communicates the product clearly without introducing unnecessary complexity.

The hero should use the approved deep green background and Porsche photograph.

The heading must have carefully controlled line breaks and a refined editorial appearance.

The search bar should be prominently positioned underneath the supporting text.

Maintain appropriate spacing between:

- Header
- Headline
- Supporting sentence
- Search bar
- Example pills
- Bottom of hero

Everything should align to a consistent left-hand grid.

The hero should feel balanced, not excessively tall or crowded.

## 6. Homepage Porsche image

The Porsche photograph in the current implementation is not faithful enough to the approved mockup.

The grille, rear bodywork, Porsche lettering, crop and perspective differ from the earlier design.

**Find and reuse the original approved Porsche asset if it exists in the codebase.**

Do not generate another approximation or substitute an arbitrary Porsche photograph.

Match the approved reference for:

- Vehicle appearance
- Image composition
- Cropping
- Scale
- Position of Porsche lettering
- Rear grille proportions
- Green tonal treatment
- Transition into the hero background

The photograph should sit naturally on the right side.

The transition between image and background should be seamless.

Avoid obvious rectangular overlays, unnatural gradients or distorted bodywork.

The car should support the headline rather than compete with it.

If the original asset is unavailable, report that clearly rather than silently improvising.

## 7. Search bar: identical on both pages

Create one reusable search component for Homepage and Find.

Use the same:

- White background
- Border treatment
- Corner radius
- Search icon
- Input typography
- Microphone icon
- Submit arrow
- Control spacing
- Focus and hover states

Allow the overall width to respond to each page's available space, but keep the visual proportions consistent.

### Agreed placeholder

Use exactly:

**Tell Sam what you're looking for...**

This should appear in both search fields.

Do not use different placeholder text on Homepage and Find.

Do not put an example query inside the placeholder because the example pills underneath already demonstrate what people can ask.

The placeholder should feel conversational, not technical.

The microphone icon already makes it clear users can speak their request, so don't add "or speak" to the placeholder.

### Submit button

Keep the dark green submit button, but make it a compact arrow-only control.

Remove the large "Go ask Sam" text button.

The arrow should be white and perfectly centered.

The submit control should feel integrated into the search field, not like a separate oversized button.

The microphone should sit immediately to its left with appropriate spacing.

All elements must share the same vertical center.

The search input should remain the primary visual element.

Preserve keyboard submission and functional voice input.

## 8. Natural-language example pills

The current example pills are too long and visually messy.

On Find, one pill becomes partially faded and appears to disappear behind the Porsche photograph.

That must be corrected.

Use a single shared pill component.

Use these three examples (Sam's Nov 5 2026 decision replaces the brief's original $80k, E46 M3 and 1965 wording, which the live engine answered with a question panel or no cars):

**Manual 911 under $40k**

**Red Ferrari under 10k miles**

**Corvette near Chicago**

These are short enough to remain visually balanced while still demonstrating natural-language searching.

They show different types of intent, including price, mileage and location.

Keep the pills:

- Consistent in height
- Lightly outlined
- Subtly rounded
- Appropriately padded
- Smaller than the search input
- Evenly spaced
- Quiet and elegant

At desktop widths, all three should sit comfortably on one line.

No awkward second row with one isolated pill.

On mobile, reflow naturally without clipping or fading.

The Porsche must never obscure the pills.

All pills must remain functional and initiate the correct searches.

## 9. Find page overall composition

Use the cleaner, earlier Find mockup as the reference.

Its central search area, sidebar spacing and overall proportions are stronger than the current implementation.

The page should have:

- The shared GoAskSam header
- Left-hand navigation rail
- Main content area
- Find title and description
- Centered search experience
- Subtle decorative Porsche image
- Shared footer

Avoid oversized elements and excessive empty space.

The search should feel like the natural center of the page.

The whole composition should be calm, balanced and professional.

## 10. Find title and supporting copy

At the upper-left of the main content area:

**Find**

Below it:

**Search live and recent auctions across multiple platforms.**

Use the proper serif heading and refined sans-serif supporting text.

Avoid additional marketing language.

The title should not be unnecessarily large.

Make sure its left alignment matches the main content grid.

## 11. Find central search experience

Keep the central headline:

**What car are you looking for?**

Use the approved serif typography.

The current version is too large and heavy.

Reduce the size and refine the spacing to match the earlier mockup.

Below it, use the shared search field with:

**Tell Sam what you're looking for...**

Then the three example pills.

The central composition should feel intentionally grouped.

The heading, search field and examples should all be centered within the usable main content area, excluding the sidebar.

Use a sensible maximum width for the search field.

Do not stretch it simply to fill all available horizontal space.

Do not use arbitrary absolute positioning or transforms to visually center the elements.

Use proper layout constraints.

## 12. Find left-hand rail

The latest sidebar is one of the weakest areas.

The typography looks inconsistent with the rest of the product, the icons feel crude, and the spacing needs substantial improvement.

Bring it much closer to the cleaner approved Find mockup.

### Sidebar width

Use a restrained, consistent width.

It should accommodate search history comfortably without taking too much space from the main content.

### New search button

The current New search button is too thick and visually heavy.

Make it:

- Slightly shorter
- More refined
- Less bulky
- Properly aligned
- Consistent with the primary button system

Keep the dark green background, white text and plus icon.

Use a smaller, more professional plus icon with the correct stroke weight.

The button should feel like an application control, not a marketing CTA.

### Sidebar typography

Use the approved sans-serif family.

The sidebar should not have heavier or different typography than the rest of the interface.

Use small, subtle uppercase labels:

**RECENT SEARCHES**

**TASKS**

Give them appropriate letter spacing and muted coloring.

### Search history

For signed-in users, show their actual recent searches.

Each row should have:

- One small, refined history icon
- A single-line search label
- Consistent row height
- Comfortable vertical spacing
- Subtle hover styling
- A restrained active state

Avoid awkward line wrapping.

Long queries should truncate gracefully, with the full text accessible when needed.

Do not allow individual rows to expand unpredictably.

Use consistent padding and alignment.

For users without recent searches, show appropriate suggestions or an empty state rather than fake history.

### Sidebar icons

The existing history icons are too visually heavy.

Use a consistent, high-quality icon set.

Maintain consistent icon sizes and stroke weights.

Icons should be understated and secondary to the text.

### Tasks section

Keep Tasks accessible in the rail, but avoid excessive explanatory text.

A short explanation or simple Tasks link is sufficient.

Maintain the existing Tasks functionality.

## 13. Find Porsche image

The current Porsche image on Find looks strange compared with the approved mockup.

The cropping is awkward, the image feels too large and its positioning interferes with the nearby content.

Use the original approved Porsche asset where available.

The car should emerge subtly from the lower-right corner.

It should feel like a decorative continuation of the brand identity, not the main focus.

Correct:

- Position
- Scale
- Crop
- Perspective
- Image quality
- Contrast
- Transition into the cream background

Do not stretch or distort the image.

Do not fade nearby controls or text to accommodate it.

The decorative photograph must never overlap the search bar, example pills or interactive controls.

On smaller screens, reduce its prominence or hide it if necessary.

The search experience always takes priority.

## 14. Homepage Find / Market Check / Sell section

The feature section directly beneath the Homepage hero is currently too generic.

It should feel like elegant product navigation, not three promotional cards.

Keep three equal columns:

**Find**

Search live auctions across multiple platforms in your own words.

**Market Check**

See what comparable cars have actually sold for, with the sales behind every result.

**Sell**

Discover where and how to sell your car.

Use:

- Refined, consistent icons
- Elegant serif headings
- Smaller sans-serif descriptions
- Balanced spacing
- Restrained vertical dividers
- Warm cream background

Remove the three large feature buttons.

Make the columns clickable or use discreet text links.

All headings, icons and descriptions must align consistently.

Avoid chunky beige icon containers.

Keep this section compact and professional.

## 15. Homepage real-sales example

The real-sales example is an important trust-building element.

It should demonstrate something GoAskSam can do that users might otherwise struggle to discover.

Our preferred direction is:

**Same car. Different auctions. Real selling prices.**

Use an actual car with verified earlier completed sales.

Show:

- A genuine vehicle photograph
- Earlier completed sales
- Dates
- Platforms
- Prices
- A clear way to explore the evidence

The presentation should be simple and immediately understandable.

Use a polished two-column layout with the photograph on the left and completed-sales information on the right.

The price figures should be neatly aligned and visually prominent without creating a dashboard-like appearance.

Keep the supporting explanation short.

No placeholder boxes or invented sales.

Use the real data from the existing system.

If the BMW M3 example in the approved mockup is fully verified, use it.

Do not change the example unnecessarily.

## 16. Homepage How Sam decides section

Restore the original stronger four-principle version.

Use the heading:

**HOW SAM DECIDES**

Introductory copy:

**Every range comes from real sales of cars like the one you asked about.**

Then four principles:

**1. A sale is a sale.**

Our ranges are based on completed sales, not asking prices or unsuccessful bids.

**2. Like with like.**

We use relevant comparable cars, accounting for differences in model, generation, body style, transmission, mileage and specification where supported by the data.

**3. Enough sales or nothing.**

When there isn't enough reliable evidence, we say so rather than inventing a precise answer.

**4. The count is always there.**

We show how many completed transactions support the answer and make the underlying sales accessible.

Use the original editorial structure:

One introductory column followed by four numbered columns.

Use elegant serif numbers, concise bold headings, restrained typography and thin separators.

Ensure all columns share consistent top alignment.

Do not replace this with generic feature cards.

Ensure the copy reflects the actual live methodology.

## 17. Footer: exactly the same across both pages

Use a single shared footer component.

Both pages must have identical:

- Background
- Logo
- Typography
- Links
- Spacing
- Vertical alignment
- Copyright treatment

Remove the footer tagline:

**Find, Check, Sell.**

We do not need that wording repeated.

Keep relevant links such as:

About | For Business | The Daily Vroom | What's New | Feedback | Terms | Privacy

Only show links to actual destinations.

The footer should feel premium and carefully finished.

Avoid inconsistent heights between Homepage and Find.

## 18. Layout and alignment

Everything needs to feel more level.

Establish one proper grid system across both pages.

Review:

- Header positioning
- Logo alignment
- Navigation
- Left rail
- Main content gutters
- Headings
- Search bars
- Example pills
- Image placement
- Feature columns
- Real-sales example
- Methodology section
- Footer

Use consistent spacing tokens and component dimensions.

Do not solve layout issues with one-off margins or arbitrary absolute positioning.

Absolute positioning may be used for decorative imagery, but it must never interfere with content.

Pay particular attention to optical alignment, not merely mathematical alignment.

The result should feel deliberate at every level.

## 19. Responsive behavior

Both pages must work properly on desktop, tablet and mobile.

Check at least:

- 1440px desktop
- 1024px tablet
- 768px tablet
- 390px mobile

At mobile width:

- No horizontal scrolling
- No overlapping controls
- No cropped text
- Search remains prominent
- Microphone and submit controls work
- Example pills remain readable
- Header and navigation remain usable
- Sidebar uses an appropriate mobile layout
- Porsche photography does not obscure content
- Real-sales examples reflow cleanly
- Methodology remains readable
- Footer remains properly aligned

Do not simply scale desktop elements down.

Adapt the layout appropriately.

## 20. Preserve existing functionality

This work is primarily visual.

Do not break or rewrite existing business logic.

Preserve:

- Search routing
- Natural-language processing
- Voice search
- Homepage-to-Find transitions
- Find search results
- Recent searches
- Authentication
- Tasks
- Market Check
- Sell
- Saved state
- Existing data integrations

Clicking an example pill must initiate the appropriate search.

Submitting from Homepage must preserve the query as it transitions to Find.

New search must correctly reset the current search experience.

Do not introduce hardcoded sample results into production.

Use shared components rather than duplicating logic.

## 21. Implementation order

Make the changes in this order:

**Phase 1: Shared visual foundation**

Fix fonts, colors, header, Beta label, navigation, search component, example pills and footer.

**Phase 2: Homepage**

Correct the hero, Porsche image, search presentation, feature section, real-sales example and methodology.

**Phase 3: Find**

Correct the central search experience, left rail, New search button, sidebar typography, icons, Porsche image and alignment.

**Phase 4: Responsive and functional validation**

Verify both pages at the required screen widths and ensure all existing functionality remains intact.

Do not stop after completing only one page.

## 22. Final acceptance criteria

I want to see:

1. Exactly the same GoAskSam header across Homepage and Find, including Beta.
2. Correct deep forest green and consistent fonts.
3. A much more refined Porsche image treatment on both pages.
4. One consistent search bar with the placeholder **“Tell Sam what you're looking for...”**
5. A compact dark green arrow submit button.
6. Three short, evenly spaced example pills that never clip or fade.
7. A significantly more professional left rail, with refined typography, icons and spacing.
8. A slimmer, better-proportioned New search button.
9. A clean, centered Find search experience.
10. A more professional three-column Homepage navigation section.
11. A genuine completed-sales example, with no invented data.
12. The original four-principle How Sam decides section.
13. One shared footer without the redundant tagline.
14. Proper alignment and spacing throughout.
15. Working search, voice, navigation, authentication and Tasks.
16. Responsive layouts without clipping or overlap.

**Do not send another design exploration or an unrelated mockup. Implement the corrections in the actual codebase.**

Use the approved assets where available. If something cannot be matched exactly, identify the specific limitation instead of improvising.

Run the appropriate checks, confirm the build and deployment status, and provide a concise summary of what changed and anything outstanding.

The goal is to bring the Homepage and Find page to a finished, production-quality standard without another cycle of inconsistent design changes.
