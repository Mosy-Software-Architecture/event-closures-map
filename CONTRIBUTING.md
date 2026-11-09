# Contributing

Thanks for helping. Bug reports, datasets for new events and pull requests are all welcome.

## Before you open a pull request

```sh
npm test
npm run validate -- --data examples/malaga-marathon-2026
npm run build -- --data examples/malaga-marathon-2026 && npm run smoke
```

`npm run smoke` needs Chrome or Chromium (`CHROME_PATH` if it is not in a standard place). Look at
the screenshots it writes to `dist/smoke/`.

## Ground rules

- **No dependencies.** Node 22's standard library only, in the scripts and in the page (Leaflet is
  the one exception, loaded from a CDN with SRI). This keeps the project runnable by anyone.
- **No HTML from data.** The page builds DOM nodes with `textContent`; the build escapes everything.
  Pull requests that add `innerHTML` with data, or inline scripts, will not be merged.
- **No tracking by default.** No analytics, cookies or third-party scripts in the default build.
- **English** for code, comments and docs. Interface strings exist in every supported language
  (`src/strings.js`); add new keys to all of them.
- A change to a data file's shape updates its schema, the validator if needed, the example, the
  README and the tests in the same pull request.
- Keep commits focused, with a message that says what changed and why.

## Sharing an event dataset

If you built a map for a real event, you can contribute it as `examples/<city>-<event>-<year>/`.
Include the official sources in `sources.json`, keep the notes on partial or uncertain closures,
and make sure the data is yours to share (OpenStreetMap geometry is ODbL; keep the attribution).

## License

By contributing you agree that your contribution is licensed under the Apache License 2.0, as the
rest of the project.
