# ntfy

Privacy: the page defaults to the office topic `re-LRnhJhxZyV4qdIu7g8bVca` on `https://ntfy.sh`. `YOUR_TOPIC` in the sample below is only a stand-in for the request shape. This viewer never publishes. These samples only show the JSON shape. They are not live office activity.

```bash
curl -sS \
  -H "Accept: application/x-ndjson" \
  --referrer "" \
  "https://ntfy.sh/YOUR_TOPIC/json?poll=1&since=24h"
```

A status message:

```json
{"bot":"RE Leads Watch","status":"idle","step":"Example step text only. Not a live event."}
```

`status` is one of `working`, `idle`, `waiting_user`, `error`, `done`. `step` is required text, at most 200 characters.

Usage:

```json
{"type":"usage","total_used_pct":0,"resets_at":"2026-12-01T00:00:00Z","bots":[{"bot":"RE Media Studio","used_pct":0}]}
```

The viewer does not invent `total_used_pct`, `resets_at`, or per-bot numbers when this payload has not arrived. The `0` values above are schema samples, not a report from the office.

Other accepted payloads:

```json
{"type":"roster","bots":[{"bot":"RE Listings Desk","name":"RE Listings Desk"}]}
{"type":"looks","bot":"RE Media Studio","label":"Bay","note":"Lamp"}
{"type":"groups","groups":[{"id":"studio","name":"Studio","bots":["RE Media Studio"]}]}
{"type":"chat","bot":"RE Office Manager","text":"Example note","url":"https://example.test/not-opened"}
{"type":"routines","bot":"RE Market Research","routines":[{"id":"morning","name":"Morning note"}]}
{"routines":{"bot":"RE Media Studio","items":["Cut reel","Grade color"]}}
```

Chat `url` values are shown as text and are not opened. Routine payloads are stored inactive and are not scheduled. Bots outside the seven-seat allowlist are dropped, including older names on the same shared channel.

The app polls history for `since=24h` and then keeps one live `/{topic}/json` tail. The activity feed shows the newest 100 status lines. HTTP 429 uses `Retry-After` when it is longer than the backoff, and never retries sooner than 5 seconds.
