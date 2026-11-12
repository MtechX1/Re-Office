# Open decisions

## Decided

- The office has these seven bots, one per floor: RE Office Manager, RE Leads Watch, RE Listings Desk, RE Marketing Desk, RE Closing Desk, RE Market Research, RE Media Studio.
- Stavros is the human caller and covers commercial and residential work.
- The leads CRM name is BoldTrail. The card is a placeholder and is not connected. RE Leads Watch is not shown as live monitoring.
- Vulcan 7 is Stavros's personal dialer. It is not automated. The viewer has no dial control.
- Listing sources are Crexi, LoopNet for comps and inventory, and Northeast Florida MLS.
- Research uses Northeast Florida MLS for commercial and residential market work.
- The MLS provider name is known. Access setup is still required and not connected. No connector is included.
- All bots share one ntfy topic.
- The viewer is a static site. GitHub Pages serves it at `/Re-Office/`. See hosting.md.
- The page listens to `re-LRnhJhxZyV4qdIu7g8bVca` when no fragment or saved topic is set.
- Routines are off.

## Not done

- BoldTrail, Vulcan 7, Crexi, and LoopNet remain disconnected on purpose.
- Northeast Florida MLS access still has to be set up outside this viewer. No login or import is implemented.
