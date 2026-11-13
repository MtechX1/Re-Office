# Architecture

The viewer is a Next.js static export. One client holds the office state. One fetch stream feeds every bot through the same parser.

```text
public/consume-topic.js     reads a fragment, then strips it
src/lib/office/allowlist.ts seven bots and the exclusion list
src/lib/office/definitions.ts floors, slots, teams, Stavros
src/lib/office/mls.ts       Northeast Florida MLS required inputs
src/lib/office/assignments.ts local seat changes
src/lib/office/state.ts     reducer for validated messages
src/lib/adapters/placeholders.ts disconnected BoldTrail, Vulcan 7, Crexi, LoopNet, MLS
src/lib/ntfy/parser.ts      untrusted JSON
src/lib/ntfy/stream.ts      history poll, then one live tail
src/lib/ntfy/backoff.ts     429 and reconnect delays
src/lib/ntfy/topic.ts       fragment and browser settings
src/lib/office/figures.ts   figure colors and silhouettes, independent of ntfy status
src/lib/office/motion.ts    status to bounce, bubble, particles, and quiet
src/lib/office/scene-layout.ts floor labels, stack, desk pads
src/components/office/      isometric office, terminal panels, feed, usage
```

## Floors

1. HQ — RE Office Manager. Locked confirmed seat.
2. Leads — BoldTrail centerpiece (placeholder, not connected). Stavros, human caller, commercial and residential. Vulcan 7 personal dialer, not automated, no dial control. RE Leads Watch flags BoldTrail leads for Stavros and is not monitoring live.
3. Listings — RE Listings Desk. Commercial and residential comps, listing prep, photos, and descriptions. Crexi. LoopNet for comps and inventory. Northeast Florida MLS, provider known, access setup required, not connected.
4. Marketing — RE Marketing Desk. Ads, social, email, and content.
5. Transactions — RE Closing Desk. Contracts and closings.
6. Research — RE Market Research. Commercial and residential market analysis, neighborhoods, and valuations. Same Northeast Florida MLS required input, not connected.
7. Media — RE Media Studio.

Each confirmed seat is a matte figure on a round desk pad in the isometric office. The figure is part of the viewer, not a photo and not a looks payload. Its color and silhouette identify the person. Quiet (no status in 24 hours) dims that figure and holds it still. Stavros is the human figure with a phone. Empty local arrangements show a pad and a laptop and no figure. The camera stays at a fixed isometric angle. Drag pans and the wheel zooms.

Each bot has a chat link `grokbot://app/v1/agent?id=<id>`. Inbound ntfy URLs are rendered as text and are never opened.

## Allowlist

Messages whose bot field is not one of the seven names or ids are dropped. That includes older roster members listed only in `src/lib/office/allowlist.ts`: Signal Prospector, Clip Bot, Visuals Bot, Pipeline Pulse, Stavy's Re Closer, Transaction Bot, Hollywood Bot, and RE HQ Coordinator (`63630cda-0d74-428a-a066-f5ae66bbcba3`). Leaving them off this building does not delete them anywhere else.

A roster payload cannot create a new desk. Usage rows for anyone else are omitted. The received `total_used_pct` is kept as sent.

## Stream

There is one shared topic, not a topic per bot. The browser polls `https://<host>/<topic>/json?poll=1&since=24h`, then keeps a single NDJSON tail. Fetch is used instead of `EventSource` so an HTTP 429 is visible. Retries wait at least 5 seconds, then 10, 20, 40, 80, and 120 seconds, and they honor a longer `Retry-After` up to 15 minutes. A live socket does not mark any desk online. Status text appears only after a validated message from one of the seven bots.

Routines can be parsed and stored as inactive text. `routinesEnabled` stays false. Nothing is scheduled.

## Topic privacy

The topic may arrive in the URL fragment or in browser storage. `public/consume-topic.js` copies a valid fragment into `sessionStorage` and calls `history.replaceState` so the address bar no longer has it. Query-string topic keys are removed and are not used. The page sets `Referrer-Policy: no-referrer`. The stream fetch uses `referrerPolicy: "no-referrer"`. No third-party font, script, or image host is loaded. The topic is not written to the console.

## What this process does not do

No outbound ntfy publish. No BoldTrail, Vulcan 7, Crexi, LoopNet, or MLS network call. No credential form. No analytics. No deployment from `npm run build`.
