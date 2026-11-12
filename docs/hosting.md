# Hosting

The live site is GitHub Pages: [https://mtechx1.github.io/Re-Office/](https://mtechx1.github.io/Re-Office/).

`npm run build` writes a static site to `out/`. Pushing `main` runs `.github/workflows/pages.yml`, which uploads `out/` and deploys it. `npm start` still refuses to run a Node server. The site is the static export only.

## Build

```bash
npm ci
npm test
NEXT_TELEMETRY_DISABLED=1 npm run build
```

`next.config.ts` sets `output: 'export'`, `basePath` and `assetPrefix` to `/Re-Office`, and `images.unoptimized`. `public/.nojekyll` is copied into `out/` so Pages serves the `_next` directory. Telemetry for the Next.js CLI is disabled in the npm scripts.

The page defaults to the office topic `re-LRnhJhxZyV4qdIu7g8bVca`. That name is part of the site so it can listen with no URL parameters. It is not a host environment variable.

A local check of the export, still using the Pages subpath:

```bash
npm run build
mkdir -p /tmp/re-office-pages
cp -a out/. /tmp/re-office-pages/Re-Office/
python3 -m http.server 43123 --directory /tmp/re-office-pages --bind 127.0.0.1
```

Open [http://127.0.0.1:43123/Re-Office/](http://127.0.0.1:43123/Re-Office/). `npm run preview:static` serves `out/` at the server root, so asset URLs under `/Re-Office/` will not match that preview.

## Limits

- The site is static. There is no server route. The office topic is in the page, and a fragment can replace it for one visit.
- The visitor's browser must be allowed to call the ntfy host (CORS). `https://ntfy.sh` allows that. Another https host has to send the same kind of CORS headers.
- History is the last 24 hours, then one live tail. The feed shows the newest 100 status lines.
- HTTP 429 waits at least 5 seconds. Desks stay without a status until a real message arrives.
- BoldTrail, Vulcan 7, Crexi, LoopNet, and Northeast Florida MLS are not connected. There is no login and no import.
- Routines are not run.
- No analytics or telemetry is shipped in the page.
