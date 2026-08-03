# JobSearchAggregator

Real-time **IT remote job** aggregator for Brazil, LATAM, and worldwide — built as a static **GitHub Pages** site.

**Live site:** [https://lcarlini.github.io/JobSearchAggregator/](https://lcarlini.github.io/JobSearchAggregator/)  
**App:** [`index.html`](./index.html) · **Hacks:** [`hacks.html`](./hacks.html) · **Empresas:** [`empresas.html`](./empresas.html)

Live search across public APIs, company ATS boards (Greenhouse / Lever / Ashby), and professional deep-links for LinkedIn, Indeed, Google Jobs, and dozens of regional boards.

## Features

- Parallel live fetch from **RemoteOK**, **Remotive**, **Arbeitnow**, **Jobicy**, **Himalayas**, **The Muse**, **Ashby**
- Static ATS cache (`data/ats-jobs.json`) refreshed every 6h via GitHub Action
- Deep-links (no scraping) for LinkedIn, Indeed, Google Jobs, Remotar, Gupy, Programathor, Dynamite Jobs, Torre, La Pieza, and dozens more BR/global boards
- **Empresas** catalog from bookmark folder + curated US/EU/AU companies hiring in Brazil (searchable in the UI)
- Search hacks: Google / LinkedIn / Indeed operators + ready recipes (incl. LinkedIn `f_TPR=r7200` 2-hour hack)
- Filter groups (LinkedIn/Indeed-style): **Busca · Localização · Contrato · Remuneração · Elegibilidade · Empresa · Processo**
- Market presets: LATAM, Brasil, EUA, Europa, Austrália, Remoto global
- Advanced: salary/currency, timezone, sponsorship, CLT/PJ/EOR/contractor, remote policy (anywhere / Brazil OK / LATAM only), company size/stage, Easy Apply, hide agencies, sort by recency/relevance/salary
- In-memory + IndexedDB cache (~45 min) so repeated searches skip network
- Precise progress bar per source (ok / empty / error + counts + ETA)
- UI language toggle **PT | EN**
- Seeded from **Remote** + **Empresas** bookmark folders (bookmarks file stays gitignored)

## Enable GitHub Pages

Site URL after Pages is on: **[https://lcarlini.github.io/JobSearchAggregator/](https://lcarlini.github.io/JobSearchAggregator/)**

1. Push this repo to GitHub
2. **Settings → Pages → Build and deployment**
3. Source: **Deploy from a branch**
4. Branch: `main` / folder: `/ (root)`
5. Open the URL above (serves `index.html` from the repo root)

## Local development

```bash
npm test                 # adapter + filter + deep-link tests
npm run fetch-ats        # refresh data/ats-jobs.json
npm run fetch-apinfo     # refresh data/apinfo-jobs.json (ApInfo BR)
npm run fetch-jobs       # ATS + ApInfo
npm run extract          # rebuild Remote + Empresas catalogs from bookmarks_*.html
npm run extract:empresas # only Empresas → data/empresas.json
npm run serve            # static server on :4173
```

Open `http://localhost:4173`.

## Architecture

| Layer | What |
|-------|------|
| Live CORS APIs | Browser fetches in parallel via `Promise.allSettled` |
| Static ATS JSON | Action runs `scripts/fetch-ats.mjs` (Greenhouse/Lever/Ashby) — avoids browser CORS |
| ApInfo (BR) | Action scrapes `list4.cfm` → `data/apinfo-jobs.json`; LinkedIn/Indeed are deep-links (no public API) |
| Deep-links | Official search URLs with the same filters; LinkedIn/Indeed/Google block scraping |

```
index.html
assets/js/app.js              UI + progress + i18n wiring
assets/js/search-engine.js    parallel adapters + cache
assets/js/filters.js          title/desc/geo/type filters
assets/js/sources/*           RemoteOK, Remotive, …, deeplinks
data/companies.json           ATS board slugs (from Remote bookmarks + curated)
data/ats-jobs.json            IT-filtered ATS snapshot
```

## Honest limitations

- **LinkedIn / Indeed / Google** do not offer public job search APIs for this use case and actively block scraping. The UI builds **official deep-links** instead.
- Some APIs (Himalayas, The Muse, Greenhouse) may fail CORS in the browser; those boards are covered by deep-links and/or the ATS Action cache.
- Recency filters need `postedAt` from the source — jobs without dates are excluded when a recency window is active.

## Bookmarks

`bookmarks_*.html` is **gitignored** (personal links). To regenerate catalogs locally:

```bash
node scripts/extract-bookmarks.mjs bookmarks_8_3_26.html
```

## License

MIT — use responsibly and respect each board’s terms of service.
