# GoAskSam MCP app — submission pack

MCP server: `https://goasksam.com/api/mcp` (Streamable HTTP, JSON-RPC 2.0, MCP spec 2026-07-28).
Read-only, no sign-in. Three tools: `market_check`, `car_history`, `where_to_sell`.

## App name
**GoAskSam**

## One-line description
Real collector-car auction answers: what cars like yours actually sold for, one car's full auction history, and where a given car has sold.

## Long description
GoAskSam answers collector-car questions from real auction records, never estimates. Ask it in plain language ("manual 997 Carrera S coupe", "2008 C63 AMG", "E39 M5") and it returns the hammer range cars like that have sold for, how many sales that is drawn from, the period, and the closest recorded sale with a link. Give it a VIN or a listing link and it returns that one car's full auction history, every appearance with date, auction house, mileage, result, hammer price or high bid, and whether there was a reserve. Ask where a car sells and it ranks the platforms that car has actually sold on. Every answer is grounded in recorded sales, labels hammer prices as hammer, never offers a valuation or a verdict on a live auction, and links back to the matching GoAskSam page. Read-only.

## Icon
- Primary app icon: **512×512 PNG**, square, GoAskSam mark on the cream background (`#f6f1e7`).
- Also supply **1024×1024 PNG** for the store listing and a **48×48 PNG** small variant.
- Transparent or solid cream background; no text in the icon. (Confirm the exact required sizes on the submission portal before upload; these are the standard set.)

## Privacy policy (plain, short)
GoAskSam's app for ChatGPT and Claude is read-only. When you ask a question, the app receives only the text of that question (a car description, a VIN, or a listing link) and returns an answer from GoAskSam's record of public auction results. The app does not ask you to sign in and does not receive your name, email, or account. GoAskSam logs each request (the tool used, the car text or VIN or link, a hashed client identifier for rate limiting, and timing) to operate and protect the service; it does not sell this data or use it to identify you. VINs and links you send are public auction identifiers, not personal data. GoAskSam does not fetch any live external data on your behalf for these tools; answers come from its stored records. Questions: privacy@goasksam.com.

## Terms of use (plain, short)
GoAskSam provides collector-car information from recorded public auction results, for general information only. It is not an appraisal, a valuation, or financial advice, and it never advises on a live or in-progress auction. Prices shown are hammer prices from past sales and are labeled as such; past results do not predict any future sale. The service is provided as is, read-only, and may be rate limited or changed at any time. Do not rely on it as the sole basis for a buying or selling decision. Questions: hello@goasksam.com.

## Test instructions for the reviewer
1. Connect the server at `https://goasksam.com/api/mcp` (no authentication).
2. `market_check` with **"manual 997 Carrera S coupe"** → returns a sold hammer range (about $49,000 to $67,000), a sales count, a period, and the closest recorded sale with a Bring a Trailer link, plus a result card.
3. `market_check` with **"Ferrari 812 GTS"** → a high-value range (about $716,000 to $849,000).
4. `car_history` with VIN **`ZFF97CMA5N0280384`** → one appearance: 2022 Ferrari 812 GTS, sold for $714,000 hammer at Bring a Trailer in April 2026, 4,300 miles, reserve.
5. `car_history` with a Bring a Trailer listing link → the same shape, resolved from the link.
6. `where_to_sell` with **"manual 997 Carrera S coupe"** → platforms ranked by recorded sales (Bring a Trailer, Cars & Bids, PCARMarket) with a median hammer each.
7. Confirm every answer ends with a "From GoAskSam" line and a goasksam.com link, uses hammer-price language, and never states a valuation or a live-auction verdict.

## Add it yourself first

### ChatGPT (developer mode)
1. ChatGPT → **Settings → Connectors** (or **Apps & Connectors**), enable **Developer mode** (Settings → Connectors → Advanced → Developer mode).
2. **Create** / **Add** a connector (app). Choose a remote **MCP server**.
3. Server URL: `https://goasksam.com/api/mcp`. Authentication: **None**.
4. Save. ChatGPT runs `initialize` + `tools/list` and shows the three tools.
5. In a new chat (with the app enabled), ask "what did a manual 997 Carrera S coupe sell for?" and confirm the card renders.

### Claude (custom connector)
1. Claude → **Settings → Connectors → Add custom connector**.
2. Name: GoAskSam. URL: `https://goasksam.com/api/mcp`. Authentication: **None**.
3. Add, then enable it. In a chat, Claude lists the GoAskSam tools; ask the same question to confirm `market_check` returns the range and link.

## Notes
- `mcp_calls` logging activates once `docs/supabase-mcp-calls.sql` is run.
- Guard rails: per-client rate limit (20/min, 400/day), at most 20 results per call, answers only (no archive listing).
