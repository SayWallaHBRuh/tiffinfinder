# Round 34 quality pass — 25 Sep 2026

Phone-overflow audit, a kitchen-page print stylesheet, and an "Ask the
kitchen" fallback-copy audit. No feature changes beyond these.

## Part A — Horizontal-scroll audit (360px and 390px)

Every page was loaded in the built-in browser pane against a local
`python -m http.server`, service worker unregistered and Cache Storage
cleared first (a stale `tf-v*-shell` precache can otherwise serve an older
copy of `app.js`/`styles.css` under an unchanged `?v=`, which is exactly
what happened mid-round here and cost some time to diagnose), viewport set
to 360x800 and 390x844, and `document.documentElement.scrollWidth` compared
to `window.innerWidth` (equal = no overflow). Checked at both widths:

- `/` (home / list)
- `/?k=saffron-lane-rasoi` (a kitchen page)
- `/?view=map`
- `/guide.html`
- `/kitchens.html`
- `/kitchens-checklist.html`
- `/kitchens-consent.html`
- `/poster.html?k=saffron-lane-rasoi`
- `/permitted.html`
- `/about.html`
- `/privacy.html`
- `/terms.html`
- `/404.html`

All 13 pages: `scrollWidth === innerWidth` at both 360px and 390px after the
fixes below.

### What was overflowing, and why

1. **Kitchen page (`?k=...`): the sticky section tabs (`.k-tabs`) and the
   sticky order bar (`.order-bar`).** Both are full-bleed elements (`margin-
   inline: calc(-1 * var(--gutter))`) that are direct CSS Grid items of
   `.kitchen` (`display: grid`, one implicit column). A grid item's
   automatic minimum width defaults to its content's intrinsic size unless
   overridden — here that's the *unwrapped* width of the tab links or the
   order-bar's buttons/phone number, which is wider than a phone screen.
   Chrome's mobile layout viewport then grows to fit that intrinsic size
   (the classic "layout viewport equals content width" overflow symptom),
   which is why `innerWidth` itself was inflated (399px on a 360px device)
   rather than a normal clipped scrollbar. Fix: `min-width: 0` on both
   `.k-tabs` and `.order-bar` (`styles.css`), so the grid track — and the
   negative-margin full-bleed trick — sizes to the container instead of to
   its content.
2. **`kitchens-checklist.html`: the printable checklist's fill-in-the-blank
   lines** (`________________________________________________`, up to 48
   characters with no space) inside `.check-list p`. An unbroken run of
   underscores has no break opportunity, so it forced its grid column open
   the same way. Fix: `overflow-wrap: anywhere` on `.check-list p`.

`kitchens-consent.html` and `poster.html` had no overflow of their own —
they were only ever reported as "the printable pages" as a group in the
Round 33 TODO; the actual culprits were the checklist's blank lines and
(newly found this round) the kitchen page's sticky bars.

## Part B — Kitchen-page print stylesheet

`?k=...` now prints a clean, chrome-free page: name, cuisine/type chips,
permit line, "This week's menu", "Plans and prices", the new "How ordering
works" three-step strip, pickup/delivery, and the kitchen's own Tiffin
Finder link as plain text (there is no Share button on paper). Hidden in
print: the site header/footer, the sticky section tabs, Follow/Share and
the share panel, the sticky order bar and its buttons, the "Get
directions"/"See it on the map" buttons, the optional nutrition panel (not
part of this printout), and the share kit (a kitchen's own solo page only).

Verified with headless Edge (`--headless=new --print-to-pdf`, a fresh
`--user-data-dir` under `%LOCALAPPDATA%\Temp\edgeprof\`, deleted after) at
`design/round34/kitchen-print.pdf` — 3 pages for a fully-populated sample
kitchen (menu + prices + steps + pickup + delivery + permit), no nav/tabs/
buttons/map anywhere in the PDF. `design/round34/checklist-print.pdf`,
`consent-print.pdf` and `poster-print.pdf` were also re-generated as a
sanity check that the overflow fix didn't change their print output.

## Part C — "Ask the kitchen" fallback-copy audit

Walked every optional field in `docs/listing-data.md` against what
`app.js` actually renders when it's missing:

| Missing data | Before | After |
| --- | --- | --- |
| No nutrition panel | "Ask the kitchen about nutrition and allergens." | unchanged (already correct) |
| Trial not offered | Row omitted (a real "no", not missing data) | unchanged (already correct) |
| Trial offered, price unknown | "Ask the kitchen" in the price cell | unchanged (already correct) |
| **No menu posted this week** (`menu.items: []`) | **An empty, blank `<ul>` with nothing in it** | **"Ask the kitchen about this week's menu."** |
| **Capacity/"taking new customers" unknown** | **No pill, no text — a silent gap next to "Order directly with the kitchen"** | **"Ask the kitchen if they're taking new customers right now."** |
| No delivery areas / pickup | Section omitted (a real "no", not missing data) | unchanged (already correct) |

Both fixes are in `renderKitchen()` in `app.js`. No em dashes, "N/A" or
blank rows were found anywhere else in the kitchen page or cards.

## Part D — Nutrition-panel edge cases (audit only, no bug found)

Tested by temporarily editing one sample kitchen's `nutrition` object in a
local copy of `data/kitchens.json` (reverted before commit; `git diff` was
empty afterwards) and reading the rendered `.k-nutrition` markup:

- Only `calories_min`/`calories_max` present: one "Calories" row, nothing
  else. Clean.
- Only `protein_min_g`/`protein_max_g` present: one "Protein" row, nothing
  else. Clean.
- Only `contains` present (no calorie or protein range): the whole panel
  correctly doesn't render — `normalizeNutrition()` already enforces the
  documented rule ("at least one of the calorie or protein range is
  required for the panel to show at all") by dropping `k.nutrition`
  entirely. Working as designed, not a bug.
- Empty `contains: []`: the "Contains" row is correctly omitted (`n.contains
  && n.contains.length` guards it) — no empty "Contains:" line.

## Part E — "How ordering works"

Added to every kitchen page (checked, pending and sample alike — it
describes the process, not a promise you can order this minute), right
after "Plans and prices": Browse → Message or call the kitchen directly →
Pick up or get delivery and pay the kitchen directly, Tiffin Finder never
takes orders or payments. Uses the existing `.steps` numbered-circle pattern
(already used for the "Add to Home Screen" instructions), so no new CSS
component. It is its own `<section>`, visually separate from the order
button in the sticky order bar. It is not a home-page addition — the task
only required the kitchen page for this round, and the master-plan
north-star metric is per-kitchen, not homepage traffic.

## Part F — Map legend/attribution contrast in dark mode (audit only, no bug found)

Measured with `getComputedStyle` + the WCAG relative-luminance formula
against each element's actual rendered background (walking up the DOM to
the first non-transparent `background-color`), in dark mode, on `?view=map`:

| Element | Colour | Background | Contrast |
| --- | --- | --- | --- |
| `.map-legend` (quadrant colours) | `--ink-2` | page `--bg` | 11.43:1 |
| `.map-legend-pins` (pin-kind key) | `--ink-2` | page `--bg` | 11.43:1 |
| `.map-note` | `--ink-2`, bold | page `--bg` | 11.43:1 |
| `.map-credit` (Calgary/Airdrie open-data attribution, incl. its links) | `--muted` | page `--bg` | 6.72:1 |
| `.map-hint` | `--muted` | page `--bg` | 6.72:1 |

All comfortably clear the 4.5:1 AA text threshold (smallest text here is
12px). No change made.
