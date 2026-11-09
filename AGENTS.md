# AGENTS.md

Instructions for AI agents (Claude Code, Codex, Cursor and similar) working in this repository.
There are two kinds of work here, and they follow different rules:

1. **Building an event's data with a person**: turning an official notice into the JSON files.
   This is the common case. Follow "The method" below.
2. **Changing the code**: the page, the scripts or the schemas. Follow "Working on the code".

Talk to the person in their language. The repository itself (code, comments, docs) is in English.

## The method: from the official notice to a published map

The person will usually paste a press article, a PDF from the city council or a link. Your job is
to turn it into `data/*.json` without inventing anything, and to show your work on the map.

### 1. Find the primary source

Press articles copy each other and make mistakes. Ask for, or look for, the official notice from
the authority that orders the closures (city council, traffic department, police). When the press
and the notice disagree, the notice wins; note the difference so the person can check it.

Real example: the press said "Carretera de Almería"; the council notice said "calle Almería", a
different street 5 km away. Only the notice and the GPX of the course settled it.

Put every source in `sources.json`, and mark the one the map is built from with `"primary": true`.

### 2. Write `event.json` and `branding.json` first

Date, time zone, languages, and the map area. `map.bbox` is `[west, south, east, north]` and limits
every street search, so make it cover the event and little more: a bbox the size of the province
finds homonymous streets in other towns. `map.center` is `[lat, lon]` (the other order).

The slider window (`timeline`) should cover the first and last closure.

### 3. Turn the notice into time slots and streets

Most notices group streets by time ranges. Each distinct range is a band:

```json
{ "id": "A", "from": "08:15", "to": "12:30", "color": "#e03634" }
```

- Give each band its own colour, distinguishable on a map (the validator rejects repeats). Seven is
  about the limit of what people can tell apart.
- A street closed in two ranges lists both bands: `"bands": ["A", "G"]`.
- Use the street name as the notice writes it, with its type ("Calle", "Avenida"...). The `id` is
  a short slug and never changes.
- Partial closures ("service lanes only", "northbound only", "north carriageway") cannot be drawn
  precisely from street names. Draw the whole street and say so in `note`, in every language.
  Never silently draw more or less than the notice says.
- If you are not sure where a street is, or which of two it is, set `"uncertain": true` and explain
  in `note`; it is drawn dashed and flagged. Ask the person rather than guess.

### 4. Get the geometry with `fetch-streets`

```sh
npm run fetch-streets
```

Read the whole report, and act on each section:

- **Not found**: the OSM name differs from the notice. Search openstreetmap.org for the street,
  copy its exact name and set `osm.match`, or set `osm.ways` with the way ids. Common causes:
  - the type or a preposition is missing or extra ("Paseo de Martiricos" vs "Paseo Martiricos",
    "Calle Especerías" vs "Calle Especería");
  - the street is a bridge or square without its own name in OSM. Bridges usually carry the name of
    the avenue that crosses them: find the way ids and use `osm.ways`;
  - only footways matched (pedestrian streets mapped as `footway`): set `osm.includeFootways`.
- **Ambiguous**: the name exists in two places. Its geometry is not written. Narrow it with
  `osm.bbox` around the right one (or `--accept-ambiguous` if every place is really closed).
- **Matched names**: check them. A regex that is too loose picks up a car park or a building that
  happens to share the name.
- Piers, breakwaters and terminals often have no `highway` tag: use `osm.anyTag`.
- Squares and buildings read better as areas: `osm.as: "polygon"`.
- If the course only uses part of a long street, limit it with `osm.bbox` (for example up to the
  turnaround point of the GPX): an explicit `osm.bbox` cuts the ways at its edge, so only that part
  is drawn. Use a box that ends where the closure ends.

Never draw a line by hand from memory. If OpenStreetMap does not have it, leave the street without
geometry: it will be listed in the crawlable list but not drawn, and you tell the person.

### 5. Parking, course and extra information

- `parking.json`: bans with their period in words ("From Thursday 5 Nov at 7:00 until Sunday 8 Nov
  at 15:00"), with geometry when it is a street (`osm` block, then `fetch-streets` resolves it too);
  short stretches or scattered points go without geometry, listed in the note.
- `routes.json`: get the official GPX (the organiser's website, or the public track they
  publish on a sports platform) and run `npm run gpx-to-routes -- course.gpx --id marathon`. If you only have last
  year's track, use it and say so in `source.label`. Add start and finish markers.
- **No GPX at all** (the organiser only publishes a picture of the course): leave `routes.json` out.
  The closures are what matters; the course is extra. Do not trace the course from the picture by
  hand. Name the closed streets you can read from the picture, resolve them with `fetch-streets`,
  cut long ones with `osm.bbox`, and say in `dataNotes` that the course comes from the picture.
  If a public GPX of the course exists elsewhere, ask the person before using it and cite it.
- `event.json` `info`: race times, public transport changes, alternative routes. One sentence per
  item, with `**bold**` for the subject.
- `event.json` `notice`: if the data is provisional or invented (a test, a draft before the official
  notice), say so here. Phones show `noticeShort`, or the full `notice` when there is no short one.

### 6. Validate, look, and show it

```sh
npm run validate
npm run dev
```

Then look at the map yourself: take screenshots and check that each band falls where the notice
says. `npm run shot -- --time 10:30` shows one moment; `--view lat,lon,zoom` one area; `--phone`
the phone layout. The same work in the browser: `?t=10:30&view=36.72,-4.42,16`.
Typical mistakes only the picture shows: a street in another neighbourhood, a line across the sea
(swapped coordinates), a band missing from the centre. Show the person the screenshot and the list
of notes, partial closures and uncertain streets before publishing.

### 7. Publish, and keep it current

`npm run deploy` (or the person's own hosting). From then on, changes to the notice go into the
JSON files and a new deploy; news during the event goes into `updates.json`, by hand or with
`watch-updates/`. A deploy never overwrites the live `updates.json` (the script downloads it first);
if you publish by other means, do the same.

### What not to do

- Do not present the map as official. The notice banner says it is not, and links to the source.
- Do not drop the OpenStreetMap attribution.
- Do not add analytics, cookies or third-party scripts unless the person asks for them explicitly,
  and then update the legal notice and the CSP.
- Do not invent times, streets or sources. A gap with a note beats a confident error.

## Working on the code

- Node 22, no dependencies. Do not add any without a strong reason; the point of the project is
  that anyone can run it with nothing but Node.
- `src/` is the page (vanilla JS module, Leaflet as a global). `scripts/` are the CLI tools,
  `scripts/lib/` their shared code. `schemas/` define the data contract.
- Never insert data into the DOM with `innerHTML`. Use `textContent`, `el()` and `rich()` in
  `src/app.js`. The build escapes with `esc()` in `scripts/lib/site.js`.
- No inline scripts: the CSP forbids them. JSON-LD is the only inline `<script>`, and it is data.
- A change to the data contract means: schema, validator cross-checks if needed, the example data,
  the README table, and tests.
- Run `npm test`, then `npm run build -- --data examples/malaga-marathon-2026 && npm run smoke`
  before you finish. Look at the screenshots.
- Interface strings live in `src/strings.js` (Spanish and English). New keys need both.
