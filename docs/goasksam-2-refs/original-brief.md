# GoAskSam 2.0: Unified Homepage and Product Pages (Sam's original brief, saved by Lane F Oct 23 2026)

Where Sam's GoAskSam 2.0 stage block (in docs/lane-notes.md) and this brief differ, the BLOCK wins: enthusiast not collector-car in new copy; Sell supporting line is "Platform performance · Selling strategy · PowerSeller matching"; the rail has no Keep looking section; Home has no Daily Vroom section in the body (it stays in the rail); headlines in the existing serif.

## OVERVIEW
Redesign the entry experience for GoAskSam.com into one consistent, premium experience inspired by the simplicity of ChatGPT, keeping each product's functionality separate. This is primarily a UI, navigation and search-entry redesign, not a rebuild of the products or results pages. Four destinations: Home (/), Find (currently Buy), Market Check, Sell. Tasks remains a separate existing product. Before changes inspect current routes, components, authentication, search handlers and results; reuse existing functionality.

## 1. SHARED DESIGN SYSTEM
Existing identity: warm cream background, dark-green buttons, large elegant serif headlines, existing sans UI type, restrained borders, generous whitespace, minimal clutter. Empty entry screens resemble ChatGPT's clean new-conversation experience. No large car photographs, marketing banners, featured auctions or complicated explanations on entry screens. Shared reusable components: left rail, header and account controls, natural-language search input, voice transcription, recent searches, authentication and pending-action handling. Each page submits to its OWN existing engine. NO universal AI router guessing which product a query belongs to.

## 2. ONE SHARED LEFT RAIL
Primary: Home, Find, Market Check, Sell, Tasks (active highlighted). RECENT SEARCHES: about five across Find, Market Check and Sell, each with a subtle product indication; clicking restores the query and results including refinements; clicking a primary item opens that product's fresh entry screen; no fabricated searches for new visitors. Tasks stays its own product (existing implementation, including the existing 2027 task); do NOT invent Saved Alerts, Keep Looking or Watchlist. Recent Searches (history) and Tasks (work or monitoring explicitly asked of Sam) are different. Secondary quieter links: For Business; The Daily Vroom https://thedailyvroom.com; How Sam Decides; About GoAskSam; Send Feedback; Privacy Policy; Terms of Service; Privacy Choices where applicable. Use existing routes; no dead links or duplicate pages.

## 3. HOMEPAGE
Remove the redirect from / to /sell. Primarily introduces Find; visitors should also understand GoAskSam checks historical sale prices and helps decide how to sell. Headline: "Find the car you're looking for." Subheading (Sam's block wins): "Tell Sam what you want. Search live enthusiast car auctions in your own words." One large centered natural-language input with text entry, microphone, submit, rotating conversational placeholders (e.g. "Find me a red manual Porsche 911 from the 1990s, preferably under $100k."); helper "Speak or type naturally." The homepage input is a FIND search only: capture the full request, navigate directly to Find, execute it automatically, display the existing Find results; never make the user search twice; never show the empty Find entry screen first. Beneath: two compact secondary cards: Market Check ("See what similar cars have actually sold for.") opens the Market Check entry screen; Sell a Car ("Discover where and how to sell.") opens the Sell entry screen. Recent searches belong in the rail, not the homepage body. (The brief's Daily Vroom section is DROPPED by Sam's block.)

## 4. RENAME BUY TO FIND
User-facing everywhere: sidebar, headings, entry labels, buttons and references, page titles. /find canonical; /buy and old links keep working (redirect/route); do not break bookmarked URLs or existing search result links. A naming and entry-experience change, not a rebuild of Buy's search.

## 5. FIND ENTRY PAGE
Sidebar Find click shows a clean centered search screen. Headline "What car are you looking for?"; subheading (block wins): "Describe it naturally. Sam searches live enthusiast car auctions for you."; shared input with voice and submit; rotating examples ("Find me a manual Ferrari 575M.", "Show me low-mileage BMW E46 M3s under $50k.", "Find air-cooled Porsche 911s ending this weekend."); supporting line "Type it or say it. No complicated filters." No featured listings, big photographs, conventional filter panel or recent-search section in the main content. Three entry scenarios: A sidebar click = fresh empty input; B homepage search = directly to populated results; C recent Find search = restore search and refinements and show results.
PRESERVE the existing Find results and cards unchanged: three-column desktop grid, large clickable photos, platform and time remaining, current bid information, specifications, Sam's Take, prominent historical sold-price ranges, supporting sales evidence and dates, honest insufficient-data messages, existing clarification questions, natural-language refinement bar, Market Check and auction links, existing sorting; three cards above the fold; do NOT shorten cards to fit more. SOLD BEFORE / LISTED BEFORE: preserve both (verified appearances of the exact vehicle; Sold Before = verified previous sale; Listed Before = verified previous listing without a confirmed completed sale); keep visual treatment and hover highlighting; never over the photographs (photos link to the platforms); the history indicator opens the existing modal; the modal's See Full History opens the existing standalone car-history page (preserve content and SEO). Keep the refinement field ("Tell Sam what to change, like only manuals or near 90210."), typed or spoken; refinements preserve the original search's constraints.

## 6. MARKET CHECK ENTRY PAGE
Same clean layout and input styling; different purpose: Find searches live auctions, Market Check searches completed sales. Headline "What have cars like yours sold for?"; subheading "Real completed sales. A typical sold range. The evidence behind it."; one large input, placeholder "1963 Jaguar E-Type Series 1 roadster"; describe the car or paste a VIN; voice and submit. Sidebar click = fresh empty screen; arriving from a Find result via the Market Check link carries the vehicle across and DISPLAYS THE RESULTS DIRECTLY; a previous Market Check search restores its results. PRESERVE existing results: typical sold ranges, completed-sale evidence, photos and receipts, comparability rules, mileage refinement, Sam explanations, source auction links, honest insufficient-evidence messaging; do not change matching or calculation; no speculative valuation, appraisal or estimated-price language (actual completed sales, not a single invented value). Remove from the empty state: the large Porsche hero image, promotional sections, sample result cards, demonstration panels, excessive copy.

## 7. SELL ENTRY PAGE
The current Sell page is already close: do not rebuild; match Home, Find and Market Check visually; replace its special sidebar with the shared rail. Headline "Where should you sell your car?"; subheading "Tell Sam what you're selling. See what the auction data says about where and how to sell it."; same visual search component; placeholder "Tell me about your car, or paste a VIN..."; text, voice, submit; supporting line (block wins) "Platform performance · Selling strategy · PowerSeller matching". On submission run the existing Sell workflow and display the relevant results directly. Preserve platform comparisons, selling strategy, reserve vs no-reserve evidence, PowerSeller matching, auction data, recommendations and methodology. Do not force choosing Platform Fit / Selling Strategy / PowerSeller Matching before entering the vehicle.

## 8. VOICE ACROSS ALL FOUR ENTRY SCREENS
One shared implementation. Flow: tap microphone, recording starts with clear visual feedback, speak, words transcribed, transcription appears as EDITABLE text, user reviews and corrects, submits, the product runs its existing search. The microphone must WORK, not just appear. Voice and typed queries behave identically after transcription. Handle permission errors and unsupported browsers gracefully. No separate AI conversation engine for voice.

## 9. AUTHENTICATION AND SIGN IN
Shared Sign in top right of the homepage and product pages; when authenticated, the existing account control. Existing authentication infrastructure. Users can search without signing in (searching, results and market evidence never require authentication). NEVER LOSE SOMEONE'S WORK: if a visitor clicks Save Search or starts an existing Task-related action that needs authentication: preserve the query, all refinements and criteria, and the intended action; start sign-in; return to the same context; automatically complete the original action; show confirmation; never make users repeat the search or click Save again; the pending action survives authentication redirects; prevent duplicate saves; if they cancel sign-in keep the search intact. Reuse existing save and Task functionality.

## 10. CONSISTENT SEARCH EXPERIENCE
Home -> Find; Find -> Find; Market Check -> Market Check; Sell -> Sell. No universal AI router. Results keep linking intelligently to other products. Do not ask again for information already supplied when navigating between products and sufficient car details are available.

## 11. MOBILE
All pages responsive: collapse the rail appropriately, retain main navigation, keep Sign in accessible, comfortable inputs, adequate touch targets for microphone and submit, no keyboard overlap, preserve existing working mobile results layouts; no fundamentally different mobile experience.

## 12. IMPLEMENTATION
Before code: inspect routes, shared components, the Find/Buy engine and results, the Market Check and Sell handlers, authentication and Tasks; identify reusable components. Order: 1 shared navigation and account shell; 2 route/name change Buy to Find; 3 shared search input and voice; 4 new homepage; 5 Find entry; 6 Market Check entry; 7 Sell entry; 8 Recent Searches sidebar; 9 authentication continuity and pending actions; 10 responsive testing and regression. Do not delete or overwrite working components unnecessarily.

### REQUIRED VERIFICATION (the Stage 4 regression list)
- goasksam.com no longer redirects to Sell.
- Homepage Find search opens populated Find results.
- Clicking Find in the sidebar opens the empty Find entry screen.
- Clicking Market Check opens its empty search screen.
- Clicking Sell opens its empty search screen.
- Typed and voice searches work.
- VIN searches continue working where supported.
- Existing Find auction cards remain unchanged.
- Sold Before and Listed Before continue working.
- History modals and full-history pages continue working.
- Market Check calculations and sale evidence remain unchanged.
- Sell analysis and PowerSeller functionality remain unchanged.
- Recent searches reopen the correct product and results.
- Tasks remain separate from Recent Searches.
- Anonymous visitors can search.
- Sign-in preserves queries and pending actions.
- Old /buy links still work.
- All secondary navigation links work.
- Desktop and mobile layouts display correctly.

## FINAL DESIGN PRINCIPLE
One GoAskSam. Four clear entry points. Existing intelligence preserved. Implement the agreed design rather than creating a new design direction; preserve the functionality and evidence-based results already built.
