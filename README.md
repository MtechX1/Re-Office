# Stavros RE Office

Static viewer for a seven-floor real estate office. It shows the confirmed roster, disconnected source cards, an empty activity feed, and an empty usage panel. It listens to one shared [ntfy](https://ntfy.sh) topic when you provide that topic locally. It does not publish, run routines, log into BoldTrail, place calls, or import MLS data.

Building this project writes files on your machine. It does not put the viewer on the public internet.

## Run locally

```bash
npm ci
npm test
npm run dev -- --hostname 127.0.0.1 --port 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Static build

```bash
NEXT_TELEMETRY_DISABLED=1 npm run build
```

`output: 'export'` writes the site to `out/`. Preview that folder locally, still without hosting it:

```bash
npm run preview:static
```

GitHub Pages serves the static export at [https://mtechx1.github.io/Re-Office/](https://mtechx1.github.io/Re-Office/). The workflow is documented in [docs/hosting.md](docs/hosting.md).

## Shared topic

With no URL parameters, the page listens to the office topic `re-LRnhJhxZyV4qdIu7g8bVca` on `https://ntfy.sh`. Pass a different topic in the URL fragment, or type it in the viewer:

```text
https://mtechx1.github.io/Re-Office/#YOUR_TOPIC
https://mtechx1.github.io/Re-Office/#topic=YOUR_TOPIC
```

The page stores a fragment topic in the browser and removes the fragment. A `?topic=` query is deleted and ignored, because query strings show up in host logs. There is no analytics in this app.

## Roster

| Floor | Seat | Id |
| --- | --- | --- |
| HQ | RE Office Manager | `ad0c4d13-f85a-4f05-96e9-7edbf9ccdb54` |
| Leads | RE Leads Watch, plus Stavros | `7be15da5-b6fb-482d-af03-6a8bca938f30` |
| Listings | RE Listings Desk | `3be017a1-3506-418c-8503-76ef3f55b57d` |
| Marketing | RE Marketing Desk | `7d21784b-1021-4693-be2f-9d7ffd578722` |
| Transactions | RE Closing Desk | `4be523e7-0852-47d0-859e-efc51c4e8335` |
| Research | RE Market Research | `2d5decd1-e475-4c78-9281-85fc6baca121` |
| Media | RE Media Studio | `8a76c58f-cbf6-478b-93df-75075e074916` |

Chat links use `grokbot://app/v1/agent?id=<id>`. The viewer shows them as text. It does not open them by itself.

Stavros is the human caller for commercial and residential work. Vulcan 7 is his personal dialer. It is not automated, and the viewer has no dial control.

RE Leads Watch is assigned to watch BoldTrail and flag new leads for Stavros. BoldTrail is not connected, so the desk is not monitoring live leads.

RE Listings Desk covers commercial and residential comps, listing prep, photos, and descriptions. Named sources: Crexi, LoopNet (comps and inventory), and Northeast Florida MLS.

RE Market Research covers commercial and residential market analysis, neighborhoods, and valuations. It also names Northeast Florida MLS.

Northeast Florida MLS is a required setup input for those two desks. The provider is known. Access is not connected. The viewer has no password, username, or token field and no MLS login.

Older bots are excluded from this building only. They are not deleted elsewhere. Their names live in `src/lib/office/allowlist.ts` so a shared channel cannot seat them here.

## Docs

- [Architecture](docs/architecture.md)
- [Open decisions](docs/open-decisions.md)
- [ntfy messages](docs/ntfy.md)
- [Hosting](docs/hosting.md)
