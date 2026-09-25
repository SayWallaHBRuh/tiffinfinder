# Round 29 quality pass — 25 Sep 2026

A measure-first pass across performance, accessibility and copy on the UI
work from rounds 18-28 (new logo/mascot, Baloo 2, the cuisine sprite, type
icons, the bottom sheet, sticky kitchen tabs, the TOC, the nutrition panel).
No feature or behaviour changes. Numbers below are from a local
`python -m http.server` (no gzip) read with `performance.getEntriesByType`
in the built-in browser pane, plus `gzip -c | wc -c` for what GitHub Pages
actually sends over the wire (it compresses text responses).

## Part A — Performance

### What a first load weighs

Home page (`index.html`), cold cache:

| File | Raw bytes | gzip (wire) |
| --- | ---: | ---: |
| `app.js` | 250,180 | 69,458 |
| `styles.css` | 132,655 | 31,405 |
| `data/kitchens.json` | 56,230 | (network-first fetch, not part of first paint) |
| `data/dishes.json` | 39,017 | (glossary, loaded on demand) |
| Google Fonts CSS | 834 | — |
| `icons/mascot.svg` | 2,696 | 724 |
| `icons/cuisines.svg` | 8,231 | 1,560 |
| `icons/types.svg` | 2,038 | — |
| `icons/favicon.svg` | 423 | — |

A kitchen page (`?k=<slug>`) adds the three Google Fonts `.woff2` files
(fetched once per visitor, then cached by the browser, not the service
worker, across pages): Baloo 2 800 18,632 B, Fraunces 500-700 67,304 B,
Manrope 400-800 24,836 B.

`app.js` (250 KB raw / 69 KB over the wire) and `styles.css` (132 KB / 31 KB)
are the two heaviest first-load files by far, both hand-authored with no
minifier (the project has no build step by design — see `README.md`).
**Considered and declined:** minifying either file. It would save perhaps
30-40% of the wire bytes, but this repo has no build/verify pipeline to
regenerate a minified copy safely on every edit, every future round edits
these files directly and by hand, and the project's own rule is "no build
step, no frameworks, no libraries." Shipping a minified copy that isn't
regenerated from the readable source on every change would silently drift
and risks a correctness bug that's hard to spot in a 250 KB one-line file.
Not a confirmed, safe win under this round's rules — left alone.

### SVG icons

Every number in `icons/*.svg` already had at most one decimal place (no
`139.05`-style precision to round down), so there was nothing to round —
but several files carried a redundant trailing `.0` (`139.0`, `200.0`,
`311.0` — the same value as `139`, `200`, `311` to an SVG parser, just
three extra bytes each). New `tools/optimize_svg.py` strips that
mechanically (`--check` reports savings without writing):

| File | Before | After |
| --- | ---: | ---: |
| `icons/icon.svg` | 2,834 B | 2,704 B |
| `icons/logo.svg` | 2,709 B | 2,579 B |
| `icons/mascot.svg` | 2,826 B | 2,696 B |
| `icons/cuisines.svg`, `icons/types.svg`, `icons/favicon.svg` | unchanged (no redundant `.0`) | — |

Total: 390 bytes saved across the three files. Small, but free and exactly
zero visual risk — `139.0` and `139` are the same number. Verified with a
before/after screenshot of `icons/mascot.svg` rendered standalone in the
built-in browser pane: pixel-identical.

`og-image.png` (85,745 B, well under WhatsApp's 300 KB limit per Round 18)
is not part of the app shell — it's fetched only when a link is shared —
so it doesn't affect first-load weight. No change.

### Fonts

The Google Fonts request already only asks for the weights the CSS uses
(`Baloo+2:wght@800`, `Manrope:wght@400..800`, `Fraunces:opsz,wght@9..144,500..700`),
already has `display=swap` and both `<link rel="preconnect">` tags, and
nothing extra is preloaded. Checking every `font-weight` rule against its
`font-family` found one mismatch: `.card-price strong` set
`font-family: var(--font-display)` (Fraunces) at `font-weight: 800`, but
Fraunces is only requested at 500-700. The browser was already silently
rendering it at 700 (its nearest loaded weight — confirmed by the CSS
Fonts matching algorithm, not synthetic bold), so the value in the
stylesheet didn't match what visitors actually saw. Fixed by declaring
`font-weight: 700` — no visual change, just an honest value.

**Considered and declined:** trimming Fraunces's `opsz` axis (its optical-
size axis, requested `9..144`, is the largest single contributor to that
family's 67 KB `.woff2` — bigger than the weight range). The site's
Fraunces usage spans roughly 17px to 50px, well inside the full range, and
auto `font-optical-sizing` uses that axis to pick stroke contrast per
size. Guessing a narrower axis window risks a visible (if subtle) rendering
change at some heading sizes with no reliable way in this environment to
diff two variable-font subsets pixel-for-pixel across every size in use.
Flagged for a future round with real subsetting tools, not fixed here.

### Render path

- Load order and `defer` were already deliberate and correct: `index.html`
  loads `app.js` blocking, on purpose, with a comment explaining why
  (deciding the route before first paint avoids a flash of the home page
  on a shared kitchen link); every other page loads it with `defer`.
  Verified this is consistent across all 8 other pages. No change needed.
- Every `<img>` that loads the mascot (`hero-mascot-img`, the four
  `empty-mascot` empty-state images) already sets `width`/`height`, so
  there's no layout shift once the SVG decodes. The header/footer logo and
  wordmark are inline `<svg>`/text, sized by CSS, not a network image — no
  CLS risk there either. No change needed.
- Local timing (no network throttling, so treat as a floor, not a
  real-world number): `index.html` cold load —
  `domContentLoadedEventEnd` 37 ms, `loadEventEnd` 132 ms.
  `?k=saffron-lane-rasoi` — same order of magnitude. Nothing pointed at a
  long task in `boot()`.

### Service worker

`sw.js`'s `SHELL` precache list (24 files) is the 9 HTML pages, `styles.css`,
`app.js`, `early.js`, the manifest and the 9 icon files — everything a
returning visitor needs offline, nothing more. `data/kitchens.json`,
`data/dishes.json`, `data/map/calgary.json` and `data/map/airdrie.json` are
explicitly *not* precached (documented at the top of `sw.js`): the map JSON
in particular is fetched only the first time someone opens the map view,
network-first, then cached from that point on. Confirmed this by reading
`app.js`'s `MAP_URLS` fetch path — it's called from the map-view renderer,
not from `boot()`. No change needed; this was already right.

## Part B — Accessibility re-audit

Checked with the built-in browser pane (DOM queries + visual) at 375px,
640px (a 1280px/200%-zoom stand-in — reflow test), and desktop, light and
dark:

- **Headings**: one `<h1>` exposed per view. The home hero's `<h1>` and a
  kitchen page's `<h1>` both exist in the single-page app's DOM, but the
  hero one gets the `hidden` attribute (`display:none`, removed from the
  accessibility tree) the moment a kitchen route renders — confirmed via
  `element.hidden` / `getComputedStyle().display` in the console, not just
  visually. `tools/check_ship.py`'s static one-`<h1>`-per-file check still
  passes (each page's raw HTML source has exactly one literal `<h1>`).
  Heading order on the home page and a kitchen page both run
  H1 → H2 → H3 (→ H4 only nested under an H3), no skipped levels.
- **Landmarks**: `header`, `nav` (five, each with a distinct
  `aria-label`: Primary, Views, Sections on this page, Footer, Site),
  `main`, `footer`, plus `role="search"`, `role="status"` and
  `role="dialog"` regions — all present and distinct.
- **Bottom sheets / dialogs** (filters, nav menu, order sheet, share
  sheet): each is `role="dialog"` `aria-modal="true"` with
  `aria-labelledby`, already documented (rounds 23-24) as focus-trapped
  with Escape/backdrop close and return focus. Spot-checked the filters
  sheet's markup — unchanged since Round 24, still correct.
- **Kitchen tabs / TOC**: the sticky kitchen-section nav
  (`nav[aria-label="Sections on this page"]`) and the guide/permitted
  pages' TOC both use `aria-current` on the section in view, confirmed
  present in the rendered DOM.
- **Follow toast**: `#toast` is `role="status" aria-live="polite"` (also
  `#results-status`, `#following-status`, `#alerts-status`,
  `#order-sheet-live`, `#share-status` — every dynamic status line on the
  site uses the same pattern).
- **Type icons**: `icons/types.svg` symbols are referenced with
  `aria-hidden="true"` next to the plain-text business-type label — the
  icon never carries meaning alone. Confirmed on both the card and the
  kitchen page.
- **Nutrition panel**: heading (`<h2 id="nutrition-heading">`), its
  section is a proper landmark, disclaimer text present. No contrast or
  structure issues found.
- **44px targets**: scanned every `button`, `a[href]`, `input` and
  `[role=button]` on the home page at 375px for a rendered box under
  44×44px. The only hits were inline text links inside paragraphs (footer
  attribution links, an inline "Tiffin 101 guide" link in FAQ prose) —
  exempt under WCAG 2.5.8 (inline targets), and the visually-small
  22×22px switch inputs are the `hidden`-but-interactive input paired with
  a larger styled label that carries the real hit target. No real
  sub-44px control found.
- **Reflow / 200% zoom**: resized to 640px wide (the 1280px-at-200%-zoom
  equivalent) on the home page, the map view and a kitchen page —
  `document.documentElement.scrollWidth` equalled `clientWidth` on all
  three (no horizontal scroll).
- **Contrast**: no new colour pairs were added this round (this was a
  quality pass, not a new-feature round) beyond what rounds 20 and 27
  already computed and logged (coral focus ring 4.0-5.5:1, map pin
  6.0-8.1:1). Nothing new to check.

One real fix landed from this pass — see Part C, the kitchen section tab
label was also an accessibility-relevant fix (an ambiguous tab name is a
usability/cognitive-accessibility issue, not just a copy one).

No other confirmed accessibility issues found in the round 18-28 work.

## Part C — Copy

- **Fixed**: the kitchen page's sticky section tabs (`app.js`,
  `buildKitchenTabs` caller) labelled the pickup/delivery tab
  `"Pickup/Delivery"` unconditionally, even for a kitchen that only offers
  one of the two — misleading (a delivery-only kitchen's tab said
  "Pickup/Delivery" and jumped to a section headed "Delivery areas"), and
  inconsistent with the sitewide wording used everywhere else
  (`SERVICE_LABEL`, `serviceChip()`, `cardMetaLine()`) of "Pickup",
  "Delivery" or "Pickup & delivery". The tab now reads "Pickup", "Delivery"
  or "Pickup & delivery" to match what's actually on the kitchen and what
  the rest of the site calls it. Verified against one sample kitchen of
  each kind (`dastarkhwan-dabba` pickup-only → "Pickup",
  `kesar-thali-ghar` delivery-only → "Delivery",
  `saffron-lane-rasoi` both → "Pickup & delivery").
- **Checked, not a bug**: "rotli" vs "roti" in `data/dishes.json`,
  `data/kitchens.json` and `guide.html` — these are two different,
  correctly distinct dishes (rotli: thin Gujarati whole-wheat flatbread;
  roti: the more general round flatbread), each with its own glossary
  entry and source. Not an inconsistency.
- Scanned every `<button>` label on the home page and every dynamic
  `text:` string label in `app.js` for casing: all sentence-case, no
  stray Title Case or ALL CAPS labels.
- Searched for common typos (teh, recieve, seperate, occured, untill,
  thier, calender, kichen, Kichen) and doubled spaces inside string
  literals across every page and `app.js`: none found.

## Fixes shipped this round

1. `styles.css` — `.card-price strong` `font-weight: 800` → `700` (matches
   the Fraunces weight actually loaded and rendered; no visual change).
2. `icons/icon.svg`, `icons/logo.svg`, `icons/mascot.svg` — stripped
   redundant trailing `.0` from coordinates (new `tools/optimize_svg.py`);
   390 bytes saved total, pixel-identical render (screenshot-verified).
3. `app.js` — kitchen page's sticky section tab now reads "Pickup",
   "Delivery" or "Pickup & delivery" to match what the kitchen actually
   offers, instead of always "Pickup/Delivery".
4. `sw.js` `VERSION` and every page's `?v=` bumped `tf-v1.35.0` →
   `tf-v1.36.0` (styles, `app.js` and the three edited icons all changed).

## Considered, not fixed (with reasons)

- Minifying `app.js` / `styles.css` — against the project's no-build-step
  rule and this round's "confirmed wins only" bar; see Part A.
- Trimming Fraunces's `opsz` axis range — real potential saving, but no
  reliable way to verify pixel-sameness across every size in use in this
  environment; flagged for a future round.

## Verified before committing

- `python tools/check_ship.py` — all checks pass (CNAME, banned phrases,
  no `unsafe-inline`, `VERSION`/`?v=` match, precache list, every local
  link, CSP hashes, one `<h1>` per page, DOM safety, no secrets,
  `check_diet.py`, `check_listings.py`, `target="_blank"` /
  `rel="noopener noreferrer"`, retired phone number).
- The two dark-theme token blocks in `styles.css` (lines 162-250 and
  254-340) diffed line-for-line identical (73 custom-property lines each).
- Kitchen tab label fix confirmed for all three service combinations in
  the sample data.
- SVG optimisation confirmed pixel-identical by rendering
  `icons/mascot.svg` before and after in the built-in browser pane.
- Home page, map view and a kitchen page confirmed no horizontal scroll
  at 640px wide (200%-zoom-at-1280 stand-in).
