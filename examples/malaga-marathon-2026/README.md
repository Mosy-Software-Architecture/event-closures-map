# Example: Generali Maratón de Málaga 2026

The dataset behind https://cortes-trafico-maraton-malaga.tomatic.ai/ (Sunday 8 November 2026).

```sh
npm run example                                              # dev server with this folder
npm run build -- --data examples/malaga-marathon-2026        # the site as published
```

- Times, streets, parking bans and car parks come from the council's mobility notice of
  3 November 2026 (the primary source in `sources.json`). Where the press and the notice disagreed,
  the notice won: the press said "Carretera de Almería", the notice "calle Almería".
- Street geometry is OpenStreetMap data fetched on 7 November 2026 with `fetch-streets`. A few
  streets needed help, and their `osm` blocks show how: an unnamed bridge (`ways`), a homonymous
  street far east (`bbox`), the street only used up to the turnaround (`bbox`), breakwaters without
  a `highway` tag (`anyTag`), a square and two terminal buildings (`as: "polygon"`).
- Partial closures (service lanes, one direction) are drawn in full and explained in `note`.
- `gpx/` holds the official 2026 marathon track and the 2025 half marathon track (the 2026 half
  course was not published); `routes.json` was made from them with `gpx-to-routes`.
- `updates.json` is the last-minute list as the watcher left it on race day; `watch/` holds its
  Spanish prompt and domain allowlist.

Map data © OpenStreetMap contributors, ODbL.
