# Changelog

## Round 40 — 2026-09-25

Round 40: lighter first load (lazy map), delivery-area map, dividers,
plans table polish.

- **The map moved into its own file, loaded only when it's opened.**
  `map.js` and `map.css` (new) hold everything the map view needed —
  the illustrated SVG, pins, clustering, zoom, and the preview card —
  split out of `app.js`/`styles.css`. app.js now inserts them with a
  same-origin `<script>`/`<link>` the first time someone switches to Map,
  opens "See it on the map", or lands on `?view=map` directly; every
  other visit never fetches either file. Both are still precached in
  `sw.js` so the map keeps working offline once it's been opened once.
  Nothing about how the map looks, zooms, clusters or opens a card
  changed. `app.js` dropped from 263.0 KiB to about 227.7 KiB.
- **Kitchen-page first load is back under budget.** With the map's code
  gone from the base bundle, and the map's drawing CSS (pins, community
  shapes, the preview card) split into `map.css` the same lazy way,
  `styles.css` dropped from 136.3 KiB to about 126.8 KiB. Measured with
  `tools/check_perf.py`: list-view first load 505.5 → 461.4 KiB (target
  ≤ 470), a kitchen page's first load 543.6 → 499.5 KiB (target ≤ 500).
  Also removed two CSS rules nothing referenced any more
  (`.field-label`, `.notice-ok`), found by grepping every class in
  `styles.css` against `app.js`, `map.js` and every page.
- **A kitchen that delivers now shows a small map of its areas.** Below
  the existing (and still the real, accessible) list of delivery
  communities, a small illustrated map shades those same communities
  green and marks the kitchen's pickup pin, if it has one — reusing
  `map.js`'s community shapes and pin styling, lazily loaded the same
  way the browse map is. It's `aria-hidden`, shown unzoomed (the whole
  Calgary + Airdrie picture, not a close-up) so a scaled transform can
  never measure wider than its own small frame; loads quietly and just
  stays empty if the map can't load (offline on a first visit) since the
  text list beside it already says the same thing.
- **Illustrated section dividers.** A small row of dots in the map's own
  pickup/delivery colours, purely decorative (`aria-hidden`), between the
  hero and the filters card and between the FAQ and the footer on the
  home page. No motion. Switchable in one place — the `--show-dividers`
  custom property in `styles.css`'s Tokens section — without touching any
  page.
- **Plans table polish.** The one recurring plan (day/week/month) with
  the strictly lowest per-day rate — week ÷ 7, month ÷ 30, the kitchen's
  own prices divided back to a daily rate purely to compare them — now
  gets a "Best value" tag, only when it's an unambiguous, tie-free
  lowest; never a guess. On phones (≤ 480px) each plan is now a stacked
  row (label, then price below it) instead of a tight two-column table.
- No schema change: no portion-size tiers this round (flagged in
  `plans/backlog-4.md` item 10 as its own follow-up if a real kitchen
  ever asks).
- `sw.js` VERSION and every page's `?v=` moved to `tf-v1.46.0` (map.js
  and map.css carry the same query, read from app.js's own `?v=` at load
  time rather than a second hardcoded version).

## Round 39 — 2026-09-25

Round 39: kitchen-owner guides; pointer to the private listing editor.

- **Two new sections on the "List your kitchen" page.** "Presenting your
  weekly plan clearly" (name the dishes and roti count, show day/week/month
  price together, say plainly whether you offer a trial week, post the same
  day each week with a cut-off time and pickup/delivery window, keep
  "taking new customers" honest) and "Photographing your tiffin with a
  phone" (daylight instead of flash, an overhead or slight-angle shot,
  a plain background, show the real portion) — both plain, short, and
  sourced where they make a factual claim. The photography section notes
  the site doesn't host kitchen photos yet; this is guidance for a
  kitchen's own WhatsApp status, Instagram or Google Business Profile.
- **A pointer to the private listing editor.** `docs/launch-runbook.md`
  now says where the offline listing-entry tool lives (the private
  handoff repo, not this one) for whoever picks up step 5 next.
- No app.js/styles.css changes this round; `sw.js` VERSION and every
  page's `?v=` moved to `tf-v1.45.0` because `kitchens.html` (precached)
  changed.

## Round 38 — 2026-09-25

Round 38: screen-reader focus and inert dialogs, performance budget, a11y
regression check.

- **Returning to the list keeps your place.** Opening a kitchen from a
  card, the map preview's "View kitchen", or the browser's own Back/Forward
  already moved focus to the kitchen's own heading (and still does); now
  going back the other way — Back, or the "All kitchens" link — puts focus
  back on the card you came from, instead of only the top of the results,
  so a keyboard or screen-reader user picks up exactly where they left off.
- **The rest of the page goes `inert` while a sheet is open.** The filters
  sheet, the phone menu, the order sheet and the iOS install sheet already
  trapped Tab and were labelled as dialogs; now everything behind them
  (header, the rest of main, footer) is also marked `inert` (with
  `aria-hidden` alongside it, for the rare browser without native `inert`
  support) the moment one opens, and un-marked the moment it fully closes
  — by Escape, the backdrop, a close button, or a route change. A screen
  reader's own browse-mode cursor, not just Tab, now stays inside the open
  dialog.
- **The order sheet announces "Call instead"/"Edit details".** Switching
  between the WhatsApp message view and the call-script view already
  changed the sheet's visible heading; it's now also spoken through the
  sheet's own live region a moment after the switch, so a screen-reader
  user whose focus lands on a plan radio or a button hears the new framing
  too, not just whichever control they land on next.
- **A performance budget.** `tools/check_perf.py` (new) measures the raw
  and gzip size of `app.js`, `styles.css`, every HTML page, and the
  same-origin first-load total for the list view and a kitchen page,
  against budgets in `tools/budgets.json` (JS ≤ 300 KiB, CSS ≤ 170 KiB,
  any page ≤ 60 KiB, first load ≤ 550 KiB, all raw/uncompressed) — run
  with `--online` to also measure Google Fonts' transfer size, which can't
  be checked offline. Wired into `tools/check_ship.py` as its 17th check;
  today's numbers pass with room to spare (app.js 258 KiB, styles.css 136
  KiB, first load 500–539 KiB).
- **A screen-reader regression check.** `tools/check_layout.py --a11y`
  (new mode; default mode unchanged) drives headless Edge at phone width
  through real clicks — opening the filters sheet, the order sheet and a
  kitchen page — and asserts focus lands inside the dialog, the background
  is `inert`, Escape closes it and returns focus, and a kitchen page's
  `<h1>` receives focus on open. Catches the exact class of bug this round
  fixed, automatically, next time.

## Round 37 — 2026-09-25

Round 37: tighter hero, trust links, FAQ structured data, consistency.

- **Tighter phone hero.** On phones (≤599px) the hero, filters card, view
  tabs and results row now sit closer together — the wording, font sizes
  and desktop/tablet layout are unchanged, only the vertical gaps and
  padding. Measured at 390×844: the first kitchen card used to sit at
  y=826 (a sliver above the very bottom edge); it now sits at y=750, with
  the card's name, badges and type label clearly visible above the fold.
- **"Who runs Tiffin Finder?"** — a small, quiet link to `about.html`'s
  "Who runs this" section, next to the permit badge on every kitchen page
  (both "Permit" and a sample's "About this listing") and in the order
  panel, right where someone is deciding whether to trust the badge or
  send an order. No new claims — it points at copy that was already
  published. Hidden on a kitchen's own solo link, matching the existing
  "How permits work" link there.
- **FAQPage structured data.** `index.html`'s existing `application/
  ld+json` block gained a `FAQPage` entry generated straight from the
  visible "Questions households ask" section — same six questions, same
  wording, HTML tags stripped. `tools/check_ship.py` now has a 16th check
  (`check_faq_jsonld`) that fails the build if the JSON-LD and the visible
  FAQ ever say different things. See `README.md` "Structured data" for
  why this is for clarity to search engines, not a guaranteed rich
  result — Google limits the actual FAQ rich-result snippet mainly to
  authoritative sites.
- **Drafted, not shipped:** `docs/localbusiness-schema-template.md` maps
  out a `LocalBusiness`/`FoodEstablishment` JSON-LD shape for real
  kitchens, field by field, for whenever real kitchens go live. It is
  never generated for a sample kitchen and never includes a home address;
  nothing references this file from any page yet.
- **Consistency fix:** `updateHeroCount()` in `app.js` could show a bare
  "0 kitchens" and silently hide the "waiting for a permit check" note
  when the only real kitchens on the list were mid-re-check (permit
  expired) and no samples were showing — the hero would disagree with the
  kitchen list right below it. The waiting count is now always shown when
  it's non-zero, in every branch. Everything else checked (hero count vs.
  `document.title` vs. the static meta/OG description vs. shared-link
  text, across the 24-sample, 0-kitchen-launch and real-kitchen states)
  was already consistent — the static `<title>`/meta description staying
  neutral in every state is a deliberate, documented choice (see the
  comment above `DEFAULT_TITLE` in `app.js`), not a bug.
- `sw.js` `tf-v1.42.0` → `tf-v1.43.0` (`app.js` and `styles.css` changed);
  every page's `?v=` bumped to match, as rule 9 requires.

## Round 36 — 2026-09-25

Round 36: new guide sections, state-aware hero, iOS install help, update
toast, useful offline page.

- `guide.html`: two new sourced sections. "Tiffin service vs. meal prep vs.
  meal kits" is a plain comparison of the three (cooked-and-sent-to-you vs.
  batch-cooked-and-portioned vs. raw-ingredients-you-cook), sourced to
  Wikipedia's Meal kit and Meal preparation articles. "Is a home tiffin
  kitchen legal in Calgary?" is a short, household-facing answer (general
  information, not legal advice) that points to `permitted.html` for the
  full kitchen-facing detail, dated "as of 25 Sep 2026" against
  re-checked Government of Alberta and City of Calgary pages. Both new
  sections are in the sticky "On this page" table of contents. Sources
  logged in `docs/research-notes.md` under "Round 36".
- `permitted.html`: a new "This guide's facts were last checked against
  those official pages on 25 Sep 2026" line near the top, kept visibly
  separate from any single kitchen's own "Permit checked" date -- and a
  new in-content link pointing household readers (as opposed to kitchens)
  to the new `guide.html` section.
- Home hero, `<title>` and meta description are now honest across all
  three real-world states: 24 samples (now), 0 kitchens (before launch)
  and 1+ real kitchens (after). The hero and its live kitchen count were
  already state-driven from `data/kitchens.json`; the browse page's
  `document.title` now also switches to a plain "launching soon" title
  while nothing is listed, instead of a permit-checked-kitchens title
  that would read oddly with nothing on the page. index.html's static
  meta description/OG/Twitter text was reworded ("Every real kitchen's
  permit is checked before it's listed") so it reads true in every state,
  including for a crawler that never runs the page's JavaScript.
- iOS install help was already built (round 21): `isIOS()` detects
  Safari on iPhone/iPad and swaps the header's Install button to "Add to
  Home Screen", opening a sheet with the three-step Share -> Add to Home
  Screen -> Add walkthrough. Confirmed working this round with a
  screenshot; Android/desktop keep the native `beforeinstallprompt` flow
  unchanged.
- New "update available" toast: `sw.js` no longer calls `self.skipWaiting()`
  automatically on install, so a freshly-fetched worker now sits in the
  browser's normal "waiting" state on a repeat visit instead of taking
  over mid-session. `app.js` (`initUpdateToast`) watches the
  registration, and once a waiting worker appears (never on the very
  first install -- there's no prior controller to update from) shows a
  small, dismissible, `aria-live="polite"` toast with a Reload button.
  Reload posts `{type:'SKIP_WAITING'}` to the waiting worker (a new
  `message` listener in `sw.js`), then reloads once it takes over
  (`controllerchange`). Built entirely with `createElement`/`textContent`
  (rule 6), so no HTML markup or CSP change was needed on any page.
- `offline.html`: added a "What still works offline" section -- pages
  already opened on the device, the guide/permits/kitchens/about pages
  (always precached, so they're available even if never opened before),
  and followed kitchens -- instead of only the retry/home buttons.
  Recomputed the page's CSP `style-src` sha256 hash for its changed
  inline fallback `<style>` block.
- Internal-linking check across all 9 sitemap pages: nav, footer and
  in-content links between guide/permits/kitchens/about were already
  mostly in place from earlier rounds; added the one real gap found
  (`permitted.html` had no in-content link to `guide.html`).
- Bumped `sw.js` `VERSION` to `tf-v1.42.0` and every page's `?v=` to match.
- `tools/check_ship.py` and `tools/check_layout.py` (full sweep, both
  states) pass. Screenshots of the new sections, the offline page, the
  update toast (simulated: registered, then the served `sw.js`'s
  `VERSION` was changed on a temp copy and `registration.update()`
  called) and the iOS install sheet (UA override via CDP) saved to
  `design/round36/`.

## Round 35 — 2026-09-25

Round 35: an automated layout and console check, so the kind of
phone-overflow bug found by hand in Round 34 gets caught by a script next
time.

- New `tools/check_layout.py` (standard library only): serves a temp copy
  of the site, launches headless Edge, and drives it over the Chrome
  DevTools Protocol with a minimal stdlib WebSocket client to check every
  page (index, a kitchen page in demo mode, the map, guide, kitchens, the
  checklist, the consent form, a poster, permitted, about, privacy,
  terms, 404) at four widths (360/390/768/1280), in both light and dark
  `prefers-color-scheme`, and in both the normal and "samples hidden"
  (launch) states -- 208 checks in all. Each one confirms no horizontal
  overflow, no element wider than the viewport, exactly one rendered
  `<h1>`, and no console errors. Run it by hand after UI changes:
  `python tools/check_layout.py` (`--quick` for a faster 360px + 1280px,
  light-only pass). Not part of `check_ship.py` -- it's slow and needs
  Edge installed -- see README.md, "Before you ship".
- Ran the new check across the whole site: all 208 combinations passed,
  no layout or console issues found. No site behaviour changed.

## Round 34 — 2026-09-25

Round 34: no phone overflow anywhere, a kitchen print view, and consistent
"Ask the kitchen" wording wherever data is missing.

- Fixed a horizontal-scroll bug on kitchen pages (`?k=...`): the sticky
  section tabs and the sticky order bar could force the page a little
  wider than the phone screen. Checked every page at 360px and 390px in
  the built-in browser (list, a kitchen page, the map, guide, kitchens,
  the checklist, the consent form, a poster, permitted, about, privacy,
  terms, 404) -- see `docs/quality-pass-round34.md` for the full list and
  what was wrong on each.
- Fixed the same kind of overflow on the printable checklist
  (`kitchens-checklist.html`): the long fill-in-the-blank lines
  ("Your neighbourhood: ______") couldn't wrap and pushed the page wide on
  a phone.
- New: a kitchen page prints cleanly. `?k=...`, printed or saved as a PDF,
  now shows just the name, cuisine and type, the permit line, this week's
  menu, plans and prices, "How ordering works", pickup/delivery, and the
  kitchen's own Tiffin Finder link as plain text -- no header, footer,
  section tabs, buttons, Follow/Share, or the map link. Checked with
  headless Edge (`--print-to-pdf`).
- New "How ordering works" on every kitchen page: three plain steps
  (browse here, message or call the kitchen directly, pick up or get
  delivery and pay the kitchen directly) -- a reminder, next to the order
  button but not on it, that Tiffin Finder never takes orders or payments.
- Two small gaps in the "Ask the kitchen" pattern, fixed: a kitchen with no
  menu posted yet used to show a blank space instead of a line asking to
  check with the kitchen; and the order bar showed no line at all when a
  kitchen's "taking new customers" status wasn't known. Audited nutrition
  panel edge cases (only calories, only protein, only allergens, an empty
  allergen list) and the map's dark-mode legend/attribution contrast --
  both were already correct, no change needed there.

## Round 33 — 2026-09-25

Round 33: a real, scannable QR code on each kitchen's poster.

- New `qr.js`: a small, dependency-free QR Code encoder written for this
  site (byte mode, error correction level M, symbol versions 1-10 chosen
  automatically, all 8 mask patterns scored and the best one kept). No
  library, no CDN. It draws the code as an inline `<svg>` built entirely
  with `createElementNS` (CSP-safe, no `innerHTML`).
- Checked correct the hard way before shipping: `tools/test_qr.py`
  compares `qr.js`'s module matrix, bit for bit, against a well-known
  independent QR encoder (Project Nayuki's, MIT-licensed) across 100+
  inputs -- every sample kitchen's own link, byte lengths at each
  version's capacity boundary, and random ASCII/UTF-8 strings -- both
  with automatic mask selection and with every one of the 8 masks
  forced. All match exactly. The reference encoder is a test-only
  download, never part of the site; see `tools/README-qr-test.md` for
  how to re-run the check.
- `poster.html` now shows that QR code (about 5.5cm on a printed page)
  under the kitchen's name, with "Scan to see our plans and order on
  WhatsApp" and the plain-text link underneath it -- so the poster works
  whether someone scans it or types the address by hand. The QR always
  sits on its own white card, in print and in dark mode alike, so it
  stays scannable.
- A new "Download QR (SVG)" button on the poster saves that same code as
  a standalone `.svg` file (built as a `Blob` and downloaded straight
  from the browser -- no server involved), for a kitchen that wants the
  code on a flyer, sign or menu card of their own.
- `tools/check_ship.py` now scans `qr.js` the same way it already scans
  `app.js`, `early.js` and `poster.js` (banned phrases, `unsafe-inline`,
  DOM safety, secret-looking strings).

## Round 32 — 2026-09-25

Round 32: a kitchen-owner toolkit, all static, no backend, no libraries.

- Fixed the footer note ("Preview build with sample listings…") that Round
  31 left showing in launch state. The home page now swaps it for the
  truthful half of the sentence ("Tiffin Finder does not take orders or
  payments and is not the seller of any meal.") whenever the site has zero
  kitchens live, the same way it already hides the preview bar. Static
  pages (which never load `kitchens.json`, so can't key a toggle off it)
  carry that same neutral, always-true sentence directly, dropping the
  preview-specific claim rather than risk it going stale.
- New printable "What we need from you" one-pager: `kitchens-checklist.html`,
  linked from `kitchens.html`. Mirrors `docs/adding-a-kitchen.md` in plain,
  fill-in-by-hand language (kind of place, name, cuisine, contact,
  pickup/delivery and precision, prices, trial week, capacity, this week's
  menu, permit, written consent), with a brand header (the mascot) and a
  clean `@media print` stylesheet — no header/nav chrome, large printable
  checkboxes, one page's worth of margin.
- New consent form template: `kitchens-consent.html`, linked from
  `kitchens.html` and the checklist. Plain-language and PIPA-aware: what
  shows publicly, what never does (home address unless "Exact" pickup is
  chosen), how pickup precision works, how to change or remove a listing
  (email, 48-hour target), that Tiffin Finder is free with no commission,
  and a visible "Draft — a lawyer should review this wording" note at the
  top (the existing `.callout-draft` style already used on privacy/terms).
  Printable, sign-in-person or by text/email.
- `kitchens.html`'s "What your listing looks like" is now "See your
  listing, live": a small form (kitchen name, cuisine, area, pickup or
  delivery, price per day) that re-renders the sample card in real time
  using the same `kitchenCard()` every list and map card uses, labelled
  "Preview only — nothing is sent". Nothing leaves the device; nothing is
  stored between visits.
- Share kit on a kitchen's own solo page (`?k=<slug>&solo=1`): a "Share
  your listing" panel with copy-ready WhatsApp status text ("Find our
  tiffin on Tiffin Finder: <link>" — distinct from the customer-facing
  `orderMessage()` text, which still always starts "Hi, I found you on
  Tiffin Finder."), the link itself, and a link to the new printable
  poster, each with its own Copy button (clipboard with a select-to-copy
  fallback, matching the existing Share panel's pattern).
- New printable poster page: `poster.html?k=<slug>` (mascot, kitchen name,
  the kitchen's own link in large text, a "Print this poster" button, a
  clean print stylesheet). Its own small script, `poster.js`, looks the
  kitchen up in `data/kitchens.json` client-side — no routing, no order
  sheet, just enough to fill in one page.
- **QR code: skipped this round.** A hand-written, dependency-free QR
  encoder (byte mode, error correction M) is well-documented and feasible
  in principle, but this round didn't have room to also build the
  independent decode-and-verify step (rendering the output and checking it
  against a reference decoder, or a published test-vector match) needed to
  *prove* it produces scannable codes before shipping it — an unscannable
  QR code on a printed poster is worse than no code at all. The poster
  ships with the plain link in large, readable text instead, as the brief
  allowed; QR stays a candidate for a future round with room for that
  verification step.
- `kitchens.html` FAQ: two new answers — what happens when a permit
  expires ("Permit being re-checked", ordering pauses, listing stays up),
  and changing pickup precision later (yes, any time, by email, 48-hour
  target — matching `docs/takedown-and-updates.md`'s existing promise).
- `sitemap.xml` gained the two printable pages (not `poster.html`, which
  needs a `?k=` to mean anything and isn't meant for search). Printables
  aren't in the service worker's precache list on purpose — they're tools
  for the moment, not app-shell pages.
- `tools/check_ship.py` now also scans `poster.js` for banned phrases, the
  old outreach phone number, DOM-safety issues and secrets, the same as
  `app.js` and `early.js`.
- `sw.js` `VERSION` bumped to `tf-v1.39.0` (every `?v=` bumped to match).

## Round 31 — 2026-09-25

Round 31: the Round 30 launch rehearsal found two honesty problems and the
next-backlog launch-day copy pass (A10/A11) — fixed all three, no other
feature changes.

- Removed the "Alerts" section from `index.html` (the email sign-up band
  and its "Know the moment your kitchen posts" heading) and the "How will
  menu alerts work?" FAQ item. Menu alerts were never on the settled
  decisions list (see "ADEEL'S DECISIONS" in the handoff repo's
  `plans/overnight-loop.md`) and aren't coming, so the site shouldn't
  promise them. Removed every other alert mention: the "Is it free?" FAQ
  answer no longer says "alerts will be free too"; `kitchens.html`'s
  "Followers who get told" pitch card is now "Followers who find you
  again" (no notification promise); `terms.html` no longer lists signing
  up for alerts as a free feature; `privacy.html`'s "Alert sign-up" bullet
  and "Future alerts and your consent" section are gone, replaced with one
  honest line that an earlier version offered to save an email for this
  and it's not coming back. `README.md` updated to match. The **Follow**
  feature itself is unchanged — only the notification promise is gone.
  Removed the matching JS (`app.js`: `renderAlertsState`, `onAlertsSubmit`,
  `onAlertsRemove`, `maskEmail`, `consentText`, the alerts `dom.*` refs and
  event listeners) and CSS (`.alerts`, `.alerts-form`, `.alerts-saved`,
  `.check`, `.form-status` — all alerts-only, unused elsewhere). Added a
  one-time cleanup, `cleanupLegacyAlerts()`, run on every page load, that
  deletes any `tf.alerts` value an earlier build may have saved on a
  returning visitor's device — that was a stored email address, personal
  data the site doesn't use anymore.
- The "Preview build" banner at the top of the home page used to say "Any
  kitchen marked Sample is made up for testing" even in the launch state
  (`show_samples: false`, zero real kitchens, zero samples showing) —
  untrue with no samples on screen. New `updatePreviewBarVisibility()` in
  `app.js` now hides that banner on the home page whenever the site has
  zero kitchens live; the launch hero right below it already says the site
  is launching and that kitchens are added only after their permit is
  checked, so nothing is lost. Unaffected while samples are on (checked:
  identical banner) and on every other page (`about.html`, `kitchens.html`,
  etc., which never load `kitchens.json` and always show a sample listing
  regardless of the switch, so the original wording stays accurate there).
- Launch-day copy pass (`plans/next-backlog.md` A10/A11): re-read the
  launch-state hero, FAQ and empty states with the above two fixes in
  place — found nothing else that overpromises before real kitchens exist.
- `tools/check_ship.py`: new check 15 fails the build if the phrase
  "alerts launch" or "menu alerts" appears anywhere, or if an `#alerts` /
  `.alerts` section comes back — so this can't silently regress.
- Verified with `tools/rehearse_launch.py` (fresh screenshots: no banner,
  no alerts anywhere, hero and FAQ read cleanly) and a manual pass with
  samples on (banner text unchanged, byte-for-byte) at desktop and 390px.
  `tf-v1.38.0`.

## Round 30 — 2026-09-25

Round 30: launch-readiness build-out from `plans/next-backlog.md` section
A — a rehearsal for the "turn the samples off" switch, two plain-English
runbooks, and a link checker.

- New `tools/rehearse_launch.py`: copies the whole site to a temp folder,
  turns `show_samples` off in that copy only (the real `data/kitchens.json`
  is never touched), serves it locally, and screenshots the home page,
  the map, the Following view, a former sample kitchen's own link, and
  `kitchens.html` with a fresh headless-Edge profile, then cleans up.
  Ran it and reviewed every screenshot: the launch state already matches
  what `README.md` describes (the map and Following addresses fall back
  to the same "Launching in NE Calgary" page; a former sample kitchen's
  own link shows "This was a sample listing" with a way into the demo).
- While reviewing, found the *other* empty state — a kitchen link that
  was never a sample and isn't in `data/kitchens.json` at all (the
  takedown/typo case) — read a little too much like a plain error.
  Reworded it in `app.js`: heading "No longer listed" (was "Kitchen not
  found"), body "This kitchen isn't listed on Tiffin Finder anymore — it
  may have closed, taken a break, or asked to come off the site. If you
  typed or pasted this link, double-check it." (was "That listing isn't
  here. It may have been removed or the link is wrong."). Screenshot-
  verified. Doesn't change anything shown while samples are on.
- New `site/docs/launch-runbook.md`: the first-real-kitchen process, start
  to finish, in plain language — collect details, check the permit and
  copy the public record link, log consent privately, enter the listing,
  run the ship check, rehearse locally, flip `show_samples` only on
  Adeel's word, push, confirm the deploy, check the live URLs, share the
  link.
- New `site/docs/takedown-and-updates.md`: what to do within 48 hours
  (matching `privacy.html`'s and `terms.html`'s own wording) when a
  kitchen asks to change something or be removed, how a removed listing's
  old link behaves (see above), and how permit expiry is already handled
  automatically versus when it needs treating as a removal.
- New `tools/check_links.py`: offline mode (every local href/src resolves
  — the exact check `check_ship.py` already ran, now shared from one
  place instead of two copies of the same logic) plus `--online`, which
  fetches every external URL on the site, every real kitchen's
  `permit.source_url`, and the permit-guide pages' own source lists, and
  reports anything that doesn't answer. `check_ship.py`'s local-link check
  now calls into this module rather than duplicating it. `--online` is
  never run as part of `check_ship.py`.
- `README.md`: a new "Backups" section (git plus GitHub is the backup,
  how to look at or restore an old version, and a reminder that the
  private handoff repo holds plans and leads separately), plus pointers to
  the new rehearsal script, runbooks and link checker.
- `sw.js` `VERSION` and every page's `?v=` bumped `tf-v1.36.0` →
  `tf-v1.37.0` (the `app.js` wording change above is a cached file).

## Round 29 — 2026-09-25

Round 29: a measure-first performance, accessibility and copy quality pass
on the rounds 18-28 UI work (logo/mascot, Baloo 2, the cuisine sprite, type
icons, the bottom sheet, sticky kitchen tabs, the TOC, the nutrition
panel). Full numbers and method in `docs/quality-pass-round29.md`.

- Weighed everything a first load of the home page and a kitchen page
  pulls in (`app.js` 250 KB / 69 KB over the wire, `styles.css` 132 KB /
  31 KB, the icon SVGs, the three Google Fonts files). `app.js` and
  `styles.css` are the two heavy files, both hand-authored with no
  minifier by design (no build step); minifying either was considered and
  declined this round since there's no pipeline in this repo to keep a
  minified copy in sync with every future hand-edit safely. Confirmed the
  render path (script load order/`defer`, image `width`/`height`) and the
  service worker (precache list, map JSON staying lazy-loaded) were
  already correct — no change needed there.
- New `tools/optimize_svg.py` strips redundant trailing `.0` from numbers
  in `icons/*.svg` (`139.0` and `139` are the same number to an SVG
  renderer) — 390 bytes off `icon.svg`, `logo.svg` and `mascot.svg`,
  pixel-identical (screenshot-verified).
- `.card-price strong` was declared at Fraunces weight 800, but Fraunces
  is only requested at weight 500-700 — the browser was already quietly
  rendering it at 700, its nearest loaded weight. Declared 700 to match
  what's actually shown; no visual change.
- Accessibility re-audit of the bottom sheet, kitchen tabs, TOC, empty
  states, nutrition panel, follow toast, type icons, heading order,
  landmarks, 44px targets and 200%-zoom reflow: everything checked out
  already correct. One fix did come out of it: a kitchen's sticky section
  tab always read "Pickup/Delivery", even for a kitchen offering only one
  of the two (misleading, and it didn't match the "Pickup" / "Delivery" /
  "Pickup & delivery" wording used everywhere else on the site) — it now
  reads whichever of the three actually applies.
- Copy scan across every page and `app.js`'s string labels found no
  typos and consistent sentence case; "rotli" and "roti" in the dish
  glossary were checked and confirmed to be two different, correctly
  distinct dishes, not an inconsistency.
- Version bumped to `tf-v1.36.0` (styles, scripts and the service
  worker's saved-files list all match; the three edited icons are
  unchanged by name, only by content).

## Round 28 — 2026-09-25

Round 28: a snappier Follow button, a sticky section nav on the kitchen
page, and map-preview/list-card parity (see `plans/ui-backlog.md` items
6, 7, 12).

- Follow micro-interaction (item 6): the Follow button's own colour
  change is now 90ms instead of the shared 160ms, so pressing it reads
  as instant. Tapping Follow (never Unfollow, never on a card that
  already loads as followed) also gives the checkmark a quick pop,
  gated behind `prefers-reduced-motion: no-preference` on top of the
  site's usual reduced-motion override. The toast wording is now a
  matched pair -- "Now following X." / "No longer following X." -- and
  `aria-pressed` stays in sync either way. The card's own tap target
  was already safe (the Follow button sits above the card's full-card
  link via `z-index`), confirmed with a real tap in the phone pane.
- Kitchen page section tabs (item 7): a slim sticky nav under the site
  header on a kitchen's own page -- Menu, Plans, Nutrition (only when
  the kitchen filled one in), Pickup/Delivery and About -- with
  scroll-spy (`IntersectionObserver`, the same pattern as the guide
  pages' "On this page" nav) keeping `aria-current` on the section in
  view. 44px tap targets, horizontal scroll on a phone if the labels
  don't fit, and its own `scroll-margin-top` so a tapped section clears
  both sticky bars. On a phone it sits above the sticky order bar with
  no overlap (checked in the phone pane with both on screen); on
  desktop it lives in the content column only, since the order bar's
  sticky side rail needs an unbroken column of its own.
- Map preview/list card parity (item 12): the map's bottom-sheet
  preview card was missing the business-type label entirely and showed
  only a bare day price instead of the list card's full "From
  $X/day · $X/week · $X/month" line. Both now reuse the exact same
  helpers as the list card (`businessTypeChip`, `priceLine`,
  `card-price-row`), in the same order, so the two surfaces no longer
  drift apart.
- Version bumped to `tf-v1.35.0` (styles, scripts and the service
  worker cache all move together).

## Round 27 — 2026-09-25

Round 27: a type/spacing rhythm pass, brand-coloured focus rings and
selected states, small icons for the four kitchen types, and a sticky
"On this page" contents nav for the two long guide pages (see
`plans/ui-backlog.md` items 3, 10, 13, 15).

- Type and spacing rhythm (item 3): named the site's font-size and
  spacing steps as CSS custom properties (`--fs-h1/h2/h3`, `--space-1`
  through `--space-9`) instead of the same numbers written out in each
  rule, and wired the base `h1`/`h2`/`h3`, `.section-head` and `.prose`
  padding/measure to them -- no visual change, just one named place for
  the scale future rounds should read off. Prose measure trimmed from
  70ch to the requested 68ch.
- Brand accent on focus rings and selected states (item 10, deferred from
  Round 20): the light theme's default focus ring was plain ink-black;
  it's now a darkened brand coral, `#c1481f` (a burnt-coral in the same
  hue family as the mascot's `#ff7a45`, darkened until it clears 3:1 on
  every surface it can land on -- checked with Python: 4.0-5.5:1 across
  `--bg`/`--surface`/`--surface-2`/`--surface-3`/`--accent-soft`, 4.2:1 on
  `--map-bg`). Dark theme already used `--accent-strong` (a saffron,
  6.8-10:1 on the same surfaces) for its focus ring -- left as-is and
  documented with the same numbers. Selected filter chips keep their
  forest-green fill (coral text/fill on green fails AA at this size) but
  now carry a slim coral/saffron ring instead of a green-on-green border,
  and the List/Map segmented toggle's selected tab gets a matching coral
  underline. The two dark-theme token blocks stay identical.
- Business-type icons (item 13): a small `icons/types.svg` sprite (house,
  fork-and-knife, cloche, warehouse -- one per `business_type`) sits next
  to the existing "Home kitchen · permitted" / "Restaurant" / "Caterer" /
  "Rented commercial kitchen" label, same on the card and the kitchen
  page; the text label still carries the meaning, the icon is
  `aria-hidden`.
- Sticky table of contents (item 15): `guide.html` and `permitted.html`'s
  flat row of jump-links is now a `<nav aria-label="On this page">`. At
  >=1100px it's a sticky side rail next to the prose column with the
  current section highlighted (new `initPageToc()` in `app.js`, an
  `IntersectionObserver`); on phones it's a collapsed "On this page"
  disclosure button at the top, aria-expanded/aria-controls wired to the
  list. No smooth-scroll code was added -- the anchor jump uses the
  page's existing `scroll-behavior` (already off under
  `prefers-reduced-motion`).
- Version bumped to `tf-v1.34.0` (styles, scripts and the service
  worker's saved-files list all match; `icons/types.svg` added to the
  precache list).

## Round 26 — 2026-09-25

Round 26: a UI polish pass on empty states, trust badges, the sticky order
bar, skeletons, the filters button and the 720-900px tablet band (see
`plans/ui-backlog.md` items 4, 5, 8, 9, 11, 14).

- Friendly empty states: "Nothing matches yet" (list) and "No kitchens
  match" (map) now show the brand mascot (`icons/mascot.svg`, 120px, 84px
  on the map's narrower card) instead of the small tiffin-box icon, plus a
  line naming what's active -- the search text in quotes, how many other
  filters are on, or both -- so it's clear what to clear. A new "Clear
  search" button (only shown when a search is typed) drops just the search
  box and keeps every other filter; "Reset filters" still clears
  everything. Following-empty and the launch page's "Nothing to follow
  yet" state now show the same mascot, so all four empty states read as
  one component.
- Trust-cue consistency: the permit/sample badge already comes from one
  shared function (`permitBadge()`) on the card, the map preview and the
  kitchen page, so its wording, colour and icon were already identical;
  the map preview's badge row was sized a shade smaller than the card's
  (24px vs 25px, 0.76rem vs 0.74rem) -- lined up to match exactly.
- Verified: the sticky order bar's iOS safe-area padding
  (`env(safe-area-inset-bottom)`) and single-primary-action shape from
  earlier rounds are still in place and don't cover the page below them;
  the loading skeleton's tile/title/line shapes still match the card
  (cuisine tile, bigger title and price) added in Round 25; the "Filters"
  button's live "N kitchens" count (badge + "Show N kitchens" in the
  sheet) from Round 24 is still working; the header, filters and card grid
  checked out at 768px and 820px with no wrapping or crowding.
- Version bumped to `tf-v1.33.0` (styles, scripts and the service
  worker's saved-files list all match).

## Round 25 — 2026-09-25

Round 25: kitchen cards, the kitchen page header and the map preview all
showed the same generic stacked-tiffin glyph on every card, and a card's
name and price didn't clearly out-rank the chip row around them.

- New `icons/cuisines.svg` sprite: 11 small illustrations (`<symbol>`, 120x120
  viewBox), one per cuisine in `data/kitchens.json` (Afghan, Bengali,
  Filipino, Gujarati, Hyderabadi, Nepali, Pakistani, Punjabi, South Indian,
  Sri Lankan) plus a thali plate for Jain and anything unrecognised, each
  showing that cuisine's signature dish (qabuli palaw, fish curry, rice +
  adobo, dhokla, biryani handi, momos, nihari/kebab, paratha + lassi, dosa
  + chutney, hoppers) in the mascot's ink-outlined, saffron/coral/cream
  style. `dabbaTile()` now draws `<use href="icons/cuisines.svg#...">`
  instead of the generic dabba mark, on the card, the kitchen page header
  and the map preview list, keeping the same soft hue-tinted tile
  background. Decorative, `aria-hidden`, same-origin (`img-src 'self'`),
  no new external resource.
- Card hierarchy: the kitchen name and the "From $X/day" price are now the
  two boldest, largest things on a card (`.card-title` and `.card-price
  strong` both bumped to ~800 weight); the badge row (permit/sample badge,
  diet chip, capacity pill) is a size step smaller and tucked closer
  together, so it reads as a quieter group scanned second -- nothing in it
  was removed.
- Checked card density afterwards: at 390x844 the list still shows about
  1.7 cards per screen, same as before the tile swap.
- Version bumped to `tf-v1.32.0` (styles, scripts and the service worker's
  saved-files list, including the new `icons/cuisines.svg`, all match).

## Round 24 — 2026-09-25

Round 24: on phones, the filter panel used to fill most of the first
screen (search, quadrant chips, pickup/delivery chips, cuisine/price/type,
and six switches), pushing every kitchen card below the fold.

- Below 900px wide, only the search field and the quadrant chips (NE, NW,
  SE, SW, Airdrie) stay on screen, next to a new "Filters" button. Pickup
  or delivery, cuisine, price, type and the six switches (veg, halal,
  jain, trial week, taking new customers, shows nutrition info) now open
  in a bottom sheet titled "Filters", with a sticky footer ("Clear all"
  and a live "Show N kitchens"). The button shows a badge with how many of
  those moved filters are on (search and the quadrant don't count towards
  it, since they're already visible).
- The sheet reuses the exact same controls, just moved in and out of the
  form by app.js as the screen crosses 900px, so the address-bar filters,
  the results count and the map keep working exactly as before -- nothing
  about how filtering works changed, only where the controls that aren't
  always visible live on a phone.
- Same pattern as the existing Menu and order sheets: focus moves in,
  Tab is trapped inside, Escape and a tap on the backdrop close it and
  return focus to the Filters button, `prefers-reduced-motion` skips the
  slide, and the page can't scroll behind it while it's open. 900px and
  up, nothing changed -- the filters look exactly as they did in round 23.
- Version bumped to `tf-v1.31.0` (styles, scripts and the service worker's
  saved-files list all match).

## Round 23 — 2026-09-25

Round 23: design-director pass on the inner pages (a kitchen page, the
order sheet, the map, the guide, kitchens/permitted/about/terms and the
404/offline pages), which hadn't had a polish since the rebrand.

- The 404 and "you're offline" pages showed a plain, generic stacked-tiffin
  glyph as their icon. Both now show the actual mascot mark (the same
  saffron-and-coral face used in the header and footer) instead, so an
  error or empty state is a small brand moment rather than a leftover
  placeholder. The round tile behind it no longer doubles up with the
  mascot's own circle.
- Reviewed the kitchen page (with and without a nutrition panel), the
  order sheet, the map, the guide, kitchens.html, permitted.html,
  about.html and terms.html at desktop and phone widths, light and dark:
  card spacing, heading hierarchy, the phone sticky order bar, the
  quadrant filter chips' scroll-fade, and dark-mode contrast were already
  consistent with the round 18-22 rebrand, so this round stayed a small,
  targeted fix rather than a rebuild.
- Version bumped to `tf-v1.30.0` (styles, scripts and the service worker's
  saved-files list all match).

## Round 22 — 2026-09-25

Round 22: kitchen-provided nutrition info, a filter for it, and a new
"Choosing a balanced tiffin" section in the guide.

- New, entirely optional `nutrition` field a kitchen can fill in: a calorie
  range, a protein range, an allergen "Contains:" list (drawn only from
  Canada's 11 priority allergens), a short factual note, and how and when
  it was worked out. Ranges only, never a single precise number — see
  `docs/listing-data.md` for the full shape.
- A kitchen's own page shows it as a quiet "Nutrition (estimated by the
  kitchen)" panel next to "Plans and prices", with a fixed disclaimer
  (estimates from the kitchen, not lab-tested, not checked by Tiffin
  Finder, general information not medical advice) and a link to the new
  guide section. A sample kitchen's panel is clearly marked "Sample
  estimate" on top of the listing's existing Sample tag. A kitchen with no
  nutrition data gets a one-line "Ask the kitchen about nutrition and
  allergens" instead of the panel.
- A small "Nutrition info" chip appears on a kitchen's card when it has
  this data — never any numbers on the card itself.
- A new "Shows nutrition info" filter (`nutrition=1` in the address),
  wired the same way as the other on/off filters.
- Nutrient-content and health/lifestyle claims ("low fat", "high protein",
  "healthy", "keto", "diabetic", "nut-free", "allergen-free",
  "guaranteed", and others) are banned from `data/kitchens.json`,
  everywhere a kitchen or its food is described — `tools/check_listings.py`
  now scans for them and fails the build if any appear, same as the
  existing "AHS approved" check.
- 8 of the 24 sample kitchens now carry illustrative sample nutrition data
  (new `tools/sample_nutrition.py`, deterministic, worked out from each
  kitchen's own menu and `data/dishes.json` glossary so a vegetarian
  kitchen's "Contains" list never picks up fish).
- The guide gets a new "Choosing a balanced tiffin" section (Canada's food
  guide's plate model, whole grains, sodium, oil/ghee, water) and a "What a
  kitchen's nutrition panel means (and its limits)" part explaining the
  panel and what claims the site won't allow, without repeating the banned
  words. Sources added to the guide's source list.
- Version bumped to `tf-v1.29.0` (styles, scripts and the service worker's
  saved-files list all match).

## Round 21 — 2026-09-25

Round 21: mascot hero and a bigger header logo.

- The home hero's old flat tiffin-carrier glyph (faded background art on
  the green hero) is gone. In its place, from 900px, is the new mascot
  (the full brand mark with its cloud streaks, `icons/mascot.svg`, copied
  from `design/out/mark.svg`) as a real brand moment on the right side of
  the hero: a decorative `<img>` (`aria-hidden`, empty `alt`), vertically
  centred, with a soft drop shadow so the saffron circle reads clearly on
  the green in both themes, and a gentle one-time pop-in plus a slow float
  (both driven by CSS `animation`, so the sitewide `prefers-reduced-motion`
  rule that forces `animation-duration` to near-zero already disables
  them). Below 900px the mascot is hidden entirely rather than shown
  small, so it never pushes the headline down or crowds the count pill.
  The unused `.hero-art-cluster`/`.hero-art*`/`.hero-art-dot*` markup and
  CSS (the old glyph, only ever used on the home hero) were removed.
  Checked the other standalone pages' `page-hero` bands (guide, kitchens,
  permitted, about) — none of them carried the old glyph art, so nothing
  to swap there.
- The header brand reads as a real logo next to the nav: from 720px the
  mark is 44px (was 40px) and the wordmark is 1.5rem (was 1.25rem), still
  vertically centred with the nav. Below 720px it's unchanged, so there's
  no wrapping at 360px.
- `icons/mascot.svg` is precached in `sw.js` alongside the other icons.
- Version bumped to `tf-v1.28.0` (styles, scripts and the service
  worker's saved-files list all match).

## Round 20 — 2026-09-25

Round 20: site matches the new logo. Design review across the home page,
a kitchen page, the map, the Tiffin 101 guide and the For Kitchens page, at
desktop and 360px, light and dark. Verdict: round 18's logo work (header
and footer mark, Baloo 2 wordmark, warm cream surfaces, saffron/orange
accent on buttons and badges) already reads as one brand with the new
mascot, so this round is a small, targeted follow-up rather than a rebuild.

- The map's pickup pin now uses the logo's own coral (`#ff7a45` light,
  `#ff8c5a` dark) with an ink ring (`#2b1f1a` light) instead of the same
  amber used for buttons, so the map pin visually echoes the mascot's
  coral map-pin mark. Contrast checked numerically: pin text on the pin
  is 6.0:1 (light) and 8.1:1 (dark); the ink ring on the coral fill is
  6.2:1 — all comfortably above the 3:1 needed for a non-text UI shape.
  The two dark-theme token blocks in `styles.css` were kept identical.
- Verified no page-level horizontal scroll at 360–390px (a scrollable row
  of filter chips was mistaken for overflow in a screenshot; measured
  `document.documentElement.scrollWidth` against the viewport to confirm
  it isn't).
- Looked hard at whether to swap Fraunces for Baloo 2 on the big display
  headings to match the playful mascot more closely. Decided against it:
  side-by-side screenshots show the serif headings reading calmer and
  more premium against the illustrated, colourful mascot, and Baloo 2
  at display size looks better reserved for the wordmark, where it
  already is. Left for later: extending the coral accent to focus rings
  and chip selection states — skipped this round because both are
  sitewide, high-blast-radius tokens that need their own contrast pass
  rather than a quick change.
- Version bumped to `tf-v1.27.0` (styles, scripts and the service
  worker's saved-files list all match).

## Round 19 — 2026-09-25

- Security review: checked the CSP, DOM/URL safety, link handling and the
  service worker across the whole site, and scanned the repo's full git
  history for secrets and the retired outreach phone number. Everything
  already in place (the CSP hashes, `permit.source_url` https-only
  validation in both `app.js` and `tools/check_listings.py`, `target=_blank`
  `rel="noopener noreferrer"`, `encodeURIComponent` on every mailto/WhatsApp
  link, the service worker's same-origin/`response.ok`-only caching and
  old-cache cleanup) checked out clean — nothing there needed fixing. History
  scan found nothing in this repo. Found one real gap: GitHub Pages can't
  send the response headers that stop the site being framed by another page
  (clickjacking), so `app.js` now tries to break out of a frame the moment
  it loads, and shows a small warning bar with a link back to the real site
  if that's blocked. Added two checks to `tools/check_ship.py` so this stays
  caught automatically: every `target="_blank"` link must have
  `rel="noopener noreferrer"`, and the retired outreach phone number must
  never appear on the site. Full write-up in
  `docs/security-review-2026-09-25.md`.
- Copyright and ownership protections (free, no filing, no DNS change,
  per `plans/protect-your-idea.md`): a `LICENSE` file at the repo root
  ("all rights reserved", with the City of Calgary / City of Airdrie
  open-data licences and Google Fonts' SIL licence carved out); "All rights
  reserved." added to the footer copyright line on every page; a new
  "Our content and brand" section in `terms.html`; a `SECURITY.md` (how to
  report a problem); and a short Copyright note in `README.md` pointing to
  `LICENSE`.
- Version bumped to `tf-v1.26.0` (styles, scripts and the service worker's
  saved-files list all match) — the footer text and `terms.html` changed on
  every page.

## Round 18 — 2026-09-25

- New Tiffin Finder logo: a smiling steel tiffin hanging from a coral map pin, on a saffron circle (from `design/brand.py`, approved by Adeel), with the wordmark "TiffinFinder" set in Google Font Baloo 2 (weight 800) — "Tiffin" in ink (cream in dark theme), "Finder" in orange, the three i-dots as small circles and the dot over "Finder"'s i as a tiny map pin. Replaced the old rounded-tile tiffin glyph and Fraunces wordmark in the header and footer on every page (home, about, guide, kitchens, permitted, privacy, terms, 404, offline). The visible lettering uses a dotless ı for the dot styling, so the mark is `aria-hidden` with a `.visually-hidden` "Tiffin Finder" text alongside it; the brand link's `aria-label` is unchanged. The mark keeps its 44px tap target, its hover/focus tilt (off under `prefers-reduced-motion`, as before), and is sized about 40px in the header and 32px in the footer.
- New app icons and favicon from the same source (`icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`, and a new `favicon.svg` — the pin alone — for the browser tab). `manifest.webmanifest`'s icon paths are unchanged; `background_color` is now `#fff6e8` to match the new maskable icon's cream tile. Added Baloo 2 (weight 800 only) to the existing Google Fonts `<link>` on every page — no other external resource, and the CSP already allowed `fonts.googleapis.com` / `fonts.gstatic.com`.
- Redesigned `tools/og.html` / `tools/og.css` (the `og-image.png` design source) around the new brand: the mark and wordmark, the same headline ("Find a permit-checked tiffin kitchen in Calgary."), on a warm cream background with the mark's saffron circle repeated large on the right. Re-rendered `og-image.png` with headless Edge (about 88 KB, well under the 300 KB WhatsApp limit). Removed `tools/make_og.py` (the Pillow-only generator for the previous green-gradient design) since it drew the old brand and `og.html` + headless Edge is now the one source of truth for this image; `README.md`'s "Link previews" section and Tools list updated to match.
- `404.html` and `offline.html` keep their own inline critical-CSS fallback (for JavaScript-off at deep paths); its `.logo`/`.wordmark` rules were updated to match, so its CSP style hash changed — recomputed and updated in both pages.
- Housekeeping: version bumped to `tf-v1.25.0` (styles, scripts and the service worker's saved-files list all match); `favicon.svg` and `logo.svg` added to the service worker's precache list alongside the other icons.

## Round 17 — 2026-09-25

- Replaced `og-image.png` (the picture shown when a Tiffin Finder link is shared on WhatsApp, Facebook, iMessage and similar) — it still had last round's old baked-in wording, "home tiffin kitchen(s)", left over from before the site listed every permitted kind of operator. The new image reads "Find a permit-checked tiffin kitchen in Calgary." and "Calgary · Permit-checked tiffins", matching `tools/og.html` (the design source, already updated last round) and carrying no "home kitchens only" claim.
- New `tools/make_og.py` generates that image directly with Pillow — same 1200×630 size, same brand colours (from `styles.css`), same layout (wordmark, eyebrow, headline, sub-line, `tiffinfinder.ca` pill, stacked tiffin-carrier glyph) — instead of screenshotting `tools/og.html` with headless Edge/Chrome. It uses only Windows system fonts (Georgia Bold, Segoe UI Bold; no font files added to the repo) and saves well under WhatsApp's 300 KB limit (about 92 KB) with no separate re-save step needed. `README.md`'s "Link previews" section and Tools list now describe the new one-command way to regenerate it.
- `og-image.png` isn't part of the offline app shell (`sw.js`'s precache list), so no version bump was needed this round.

## Round 16 — 2026-09-25

- Wording pass to match Adeel's decisions: the site lists every permitted kind of tiffin operator, not home kitchens only, and pickup and delivery matter equally. Updated the tagline used across page titles, meta descriptions, social-share (Open Graph/Twitter) text, the shared footer line, the hero copy on the home page, and `manifest.webmanifest` from "permit-checked home tiffin kitchens" to "permit-checked tiffin kitchens", and worked "home cooks, restaurants and caterers" into the longer descriptions where there was room.
- Rewrote the "Your pickup spot" section on the For Kitchens page so it explains that the map shows pickup spots and delivery areas side by side, instead of saying the map is "built around pickup" — the consent, precision-choice and no-home-address points are unchanged.
- Softened one-sided phrasing on About, Tiffin 101 and the Terms page (e.g. "home tiffin kitchens" → "tiffin kitchens", with "home kitchens, restaurants, caterers and rented commercial kitchens" spelled out on Terms and the permit guide) so nothing reads as home-kitchens-only. Left "home-style" and "home-cooked" language alone where it's describing the food itself, and left the `home_kitchen_permitted` business-type label and sample data alone since a home kitchen with a permit is still one of the listed types.
- `og-image.png`'s baked-in text still reads "home tiffin kitchen" from before this round; it needs a real browser render to regenerate, so `tools/og.html` was updated with the new wording for whenever that's next done, but the image itself is unchanged this round.
- Housekeeping: version bumped to `tf-v1.24.0` (styles, scripts and the service worker's saved-files list all match).

## Round 15 — 2026-09-25

- Got the site ready to hold real kitchens, following Adeel's decisions on 25 Sep 2026: every permitted kind of tiffin operator gets listed (a home kitchen with a permit, a restaurant, a caterer, or a cook renting a commercial kitchen), not home kitchens only; pickup and delivery are shown equally; the list stays the default view and the map stays secondary; the permit line keeps its one-date wording.
- New: a "Type" filter (quadrant, cuisine and price already had one) and a small neutral label on every card and kitchen page ("Home kitchen · permitted", "Restaurant", "Caterer", "Rented commercial kitchen"). Every sample kitchen got a plausible type, mostly home kitchens, a few of the others, picked the same repeatable way the sample trial weeks and pickup spots already are (`tools/sample_business_type.py`).
- A real kitchen (once one is added) can never show on the site half-checked: `app.js` now refuses to display any kitchen that isn't a sample unless its permit has a checked date, a link to the public record, and the kitchen's written OK to be listed are all present — if one's missing it's left out with a note in the browser console, not shown anyway.
- New `tools/check_listings.py` checks the same rule, plus the rest of the listing data (dates, delivery and pickup neighbourhood names against the real map data, no street address text when a kitchen chose neighbourhood-only pickup, a contact number present, none of the banned wording). It's now part of `python tools/check_ship.py`, so it runs before every commit automatically.
- New `docs/listing-data.md` documents the full shape of a kitchen's entry in `data/kitchens.json`, field by field, with a worked example. New `docs/adding-a-kitchen.md` is a plain-English, step-by-step checklist for Adeel: what to collect, how to check a permit in the AHS public inspection database, getting written consent, and choosing how precisely a kitchen shares its pickup spot.
- Housekeeping: version bumped to `tf-v1.23.0` (styles, scripts and the service worker's saved-files list all match).

## Round 14 — 2026-09-25

- Smoother moves between pages. Going from the home page to a page like the Tiffin 101 guide, or back, now gently cross-fades instead of the old hard jump, and the header stays put while it happens. It's quick (under a quarter of a second) so it feels snappy, not slow, and it only runs for browsers that support it and for visitors who haven't asked their device to reduce motion — everyone else just sees a normal page change, exactly as before.
- Faster page-to-page navigation on the About, Tiffin 101, For kitchens, How permits work, Privacy, Terms, page-not-found and offline pages: the browser quietly starts fetching the other Tiffin Finder pages you're likely to tap next (never a WhatsApp, phone or email link, and never a demo link), so tapping them can feel closer to instant. This is a Chromium feature today (Chrome, Edge); other browsers simply ignore it.
- The home page now carries a small, honest description of the site itself for search engines — its name and web address, not any claim about the kitchens listed on it. Nothing about kitchens, reviews or ratings was added.
- Both new script blocks are locked down the same way every inline script on this site already is: the security policy only allows the exact, checked bytes of each one to run, and a new automated check (`tools/check_ship.py`) now checks every inline script on every page against that policy, so a future edit that forgets to update it will fail the check loudly instead of quietly breaking.
- Housekeeping: version bumped to `tf-v1.22.0` (styles, scripts and the service worker's saved-files list all match).

## Overnight round 11 — 2026-09-25

- Finished the dish glossary audit: the 56 `data/dishes.json` entries not already checked in rounds 2 and 4 were each compared against a reputable source, prioritising dietary claims. Every one of the 126 glossary dishes has now been checked once. Two small fixes: "khichdi" was sourced to a page describing a different, millet-based regional dish under the same name, so it's now sourced to khichdi's own article instead (the wording was already accurate); "double ka meetha" now says it's fried in ghee, a dairy ingredient the old wording left out.
- Filled in a couple of missing "contains" tags so the dietary cross-check catches more: "aloo methi" (potato) now tagged with the same root-vegetable tag every other potato dish already has, and "double ka meetha" is now tagged dairy for the ghee-frying step.
- `python tools/check_diet.py` still finds no contradictions in the sample kitchen menus.
- `data/dishes.json` is loaded fresh over the network rather than cached by version number, so no version bump was needed this round.

## Overnight round 9 — 2026-09-24

- A full fresh-eyes review of everything built since the last published version (rounds 1-8): the JavaScript, the wording on the new "For kitchens" sample card and FAQ, the Tiffin 101 guide's prices and sources, the navigation on all nine pages, and accessibility. Almost everything held up; one confirmed bug is fixed below.
- The "For kitchens" page's sample listing card has a Follow button that's meant to do nothing (there's no real kitchen behind a made-up sample). It was disabled correctly for screen readers and keyboard users, but looked exactly like a normal, clickable button — full colour, a pointing-hand cursor — so a sighted visitor could tap it and get no response with no clue why. It now dims and shows a "not allowed" cursor, like a disabled button should.
- Everything else checked out: no wording issues, no broken links, no repeated FAQ setup, prices consistent across the guide and the site's own filters, dark-mode colours unchanged, `tools/check_ship.py` passes.
- Housekeeping: version bumped to `tf-v1.21.0` (styles, scripts and the service worker's saved-files list all match).

## Overnight round 8 — 2026-09-24

- Checked the permit guide's exemption section (why Alberta's low-risk home-food rule doesn't cover hot tiffin meals) against the two official Government of Alberta pages it's built on. Both still say exactly what the page already quotes, so the wording is unchanged — the sources were just re-confirmed and logged.
- The Tiffin 101 guide's price ranges used to be based only on this site's own made-up sample listings. They're now based on prices we found this September on real, publicly posted Calgary tiffin plans instead: roughly $10-$24 a day, $70-$90 a week, and $240-$320 a month. No business names appear on the page — only in the source list at the bottom.
- Housekeeping: version bumped to `tf-v1.20.0` (styles, scripts and the service worker's saved-files list all match).

## Overnight round 7 — 2026-09-24

- The "For kitchens" page now shows what a real listing looks like: a live sample card, built by the same code that draws every card on the list and map, clearly marked "Sample listing".
- A new "Request a listing" button opens your email app with a short, already-filled-in message to sitesbyadeel@gmail.com — your kitchen's name, area, pickup or delivery, the number you want shown, and whether you already hold a permit. The page also spells out plainly that we check the permit and ask written consent before anything goes live, your pickup spot only shows at the precision you choose, and we never show a home address.
- A new "Questions kitchen owners ask" section, an accordion like the household one on the home page: cost, what we need, how the permit check works, how customers reach you, how to update or remove a listing, and privacy of your location.
- Housekeeping: version bumped to `tf-v1.19.0` (styles, scripts and the service worker's saved-files list all match).

## Overnight round 6 — 2026-09-24

- A new ship checklist: `python tools/check_ship.py` runs every pre-commit check in one command (CNAME, banned words, security policy, version numbers, broken links, one heading per page, DOM safety, no secrets, the diet cross-check) and fails loudly if anything is wrong. Documented in the README.
- Design pass: the home page's big green banner had a lot of empty space on its right side on a desktop screen. It now has a small cluster of the tiffin-carrier icon and a few soft dots to fill that space, so it reads as one finished picture instead of text-then-emptiness. Nothing moved, nothing changed for phones, and it looks the same in light and dark.
- Checked the home page, the "Launching in NE Calgary" page, a kitchen page with the order sheet open, the Tiffin 101 guide and the permit guide at phone and desktop width, in light and dark — spacing, type and card styling were already consistent, so no other changes were needed.
- Housekeeping: version bumped to `tf-v1.18.0` (styles, scripts and the service worker's saved-files list all match).

## Round 1 — 2026-09-22

- Phones now get a Menu button at the top of every page. It opens a panel with the main site links, and closes with the X, by tapping outside it, or with the Escape key.
- Your search and filter choices now stay in the web address, so you can share a filtered list or reload the page without losing it. Going back from a kitchen brings the same list back.
- Links to Tiffin Finder shared on WhatsApp, Facebook and iMessage now show a Tiffin Finder preview card with a picture, instead of a bare link.
- The "page not found" screen now looks right and its links work, even for long or mistyped addresses, and it has the theme switch and Menu button like the other pages.
- Small fixes: the kitchen list no longer redraws twice for every tap, and the Install button fits on small phones.
- The kitchens shown are still made-up samples for testing, each marked "Sample".

## Round 2 — 2026-09-23

- Smoother, quicker page animations. On phones, cards no longer stay "lifted" after you tap them.
- While a kitchen's page loads, you now see grey placeholder shapes instead of a blank space.
- A proper "You're offline" screen when there's no connection, and the kitchen list reloads by itself when you're back online.
- Friendlier "nothing here" screens with the tiffin illustration.
- A short "Questions households ask" section on the home page: how ordering works, what "Permit verified" means, what it costs, how alerts will work, how to suggest a kitchen, and that the current kitchens are samples.
- The home page headline and link previews now describe how permit checking works, instead of claiming the sample kitchens were checked. The count now says "sample kitchens".
- Richer dark mode.
- The kitchens shown are still made-up samples for testing, each marked "Sample".

## Round 3 — 2026-09-23

- More sample kitchens: 24 instead of 10, across every quadrant and Airdrie, now including Hyderabadi, Nepali, Sri Lankan and Filipino home cooking, so every filter shows results.
- Search now finds kitchens by neighbourhood. Type "Saddle Ridge" to see every kitchen that delivers there.
- On a kitchen's page, each delivery area can be tapped to list all kitchens that deliver to it. The chosen area shows as a green pill above the list; tap the pill to remove it.
- A new "Browse by neighbourhood" section on the home page groups communities by quadrant, with how many kitchens deliver to each.
- On a kitchen's page, dish names with a dotted underline can be tapped to show a one-line description, such as what haleem or sambar is.
- Community names and quadrants were checked against the City of Calgary's and City of Airdrie's own lists, which fixed a few areas that were in the wrong quadrant. Sources are noted in docs/research-notes.md.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 4 — 2026-09-23

- New map view. Above the kitchen list you can now switch between "List" and "Map". The map shows Calgary's communities shaded by quadrant, with Airdrie in a small panel to the north.
- Each pin sits on a neighbourhood a kitchen delivers to, never on anyone's address. Where several kitchens share a neighbourhood, one pin shows how many.
- Tap a pin for a quick preview: name, cuisine, quadrant, price per day, permit status and a button to see this week's menu. On phones it slides up from the bottom. Escape, the X or tapping elsewhere closes it.
- Search and filters work on the map too. Choosing a quadrant, or tapping part of the map, zooms in. "Show all of Calgary" zooms back out.
- The web address remembers the map, so a shared link opens straight on it. The list is still the default.
- The map downloads only when you first open it, and works offline after that.
- Map shapes come from the City of Calgary's and City of Airdrie's open data, credited under the map.
- The kitchens page and privacy page now mention the map and that it never shows addresses.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 5 — 2026-09-23

- The map is now built around pickup, because most home tiffin kitchens don't deliver. Kitchens that offer pickup get their own saffron pin with a little bag on it.
- Delivery-only kitchens show as an outlined pin on their neighbourhood. When pins are close together they join into one numbered pin; tap it to see each kitchen.
- A kitchen's preview shows whether it does pickup, delivery or both, and where to pick up. Kitchens that share an exact spot or nearest intersection get a "Get directions" button that opens Google Maps. The sample kitchens don't have one.
- Opening a kitchen that delivers lightly shades the neighbourhoods it delivers to on the map.
- New "Pickup / Delivery" filter. It works on the list and the map, and is remembered in the web address.
- Each kitchen card and page now shows "Pickup", "Delivery" or "Pickup & delivery". Kitchen pages have a Pickup section with a "See it on the map" link.
- Searching now finds pickup spots too. Tapping a neighbourhood shows kitchens that offer pickup there as well as those that deliver.
- The kitchens page, privacy page and terms now explain that each kitchen chooses how its pickup spot is shown (exact address, nearest intersection or neighbourhood only), can change it at any time, and that Tiffin Finder never shows more than that.
- The kitchens are still made-up samples for testing, each marked "Sample". Their pickup spots are made-up points inside their neighbourhood, with no street locations.

## Round 6 — 2026-09-23

- The sample kitchens can now be hidden with one switch in the data file. With them off, the home page becomes a "Launching in NE Calgary" page with two buttons, "List your kitchen, free" and "See how it works", until real kitchens are added.
- A demo address, tiffinfinder.ca/?demo=1, always shows the sample kitchens. It has a "Demo" banner saying the kitchens are made up, and it asks search engines not to list it.
- Sample kitchens now say "Sample listing" instead of any permit badge, and their pages have an "About this listing" section instead of a permit section.
- "Permit verified" is now "Permit checked", with the date we checked, a link to the public record when we have one, and a plain note that it's not a food-safety inspection or endorsement. The wording across the site, the terms and the kitchens page matches.
- If a kitchen's permit expiry date passes, its badge changes to "Permit being re-checked" and ordering pauses until we check again. It isn't counted as permit-checked in the meantime.
- WhatsApp order messages now start "Hi, I found you on Tiffin Finder.", so kitchens can see who found them here.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 7 — 2026-09-23

- Kitchen cards now show the day, week and month prices on one line, a "Trial week" price when the kitchen offers one, and whether the kitchen is taking new customers, has a waitlist or is full.
- Each kitchen's page has a "Plans and prices" table.
- New "Trial week" and "Taking new customers" filters. They work on the list and the map, and are remembered in the web address.
- "Order on WhatsApp" now opens a short "You're about to send" panel: pick a plan and a start day, add a note, and see the exact message before you send it. Or call, with a short script of what to say. Nothing is saved or sent anywhere but your own WhatsApp or phone.
- Kitchens that are full say "Ask to join the waitlist", and kitchens with a waitlist say "Join the waitlist".
- Sample kitchens show how ordering works, but can't be messaged or called.
- Before launch, the Following and map pages show the "Launching in NE Calgary" page too.
- The home page no longer flickers while it loads.
- The kitchen count now says "waiting for a permit check".
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 8 — 2026-09-23

- The "How to get permitted" page is now a step-by-step guide checked against official Alberta Health Services, Government of Alberta and City of Calgary pages on 23 September 2026, with a numbered checklist, what the home-food exemption does and doesn't cover, the two routes to a permitted kitchen, the fees and timelines those pages list, how to look up a kitchen's public inspection record, who to call, and a list of every source. It's still general information, not legal advice.
- The For kitchens page links to it: "Not permitted yet? See how to get permitted".
- Map previews now show the "Trial week" price and whether a kitchen is taking new customers, has a waitlist or is full, like the kitchen cards.
- Every page now tells browsers to load only Tiffin Finder's own files and Google Fonts, and to share less of your browsing with other sites. Nothing looks different.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 9 — 2026-09-23

- Pages now load fresh: when you're online you always get the latest version of a page. The saved copy is used only if the connection fails or is very slow, so a returning visitor no longer sees an out-of-date page.
- Every kitchen's page has a Share button. On phones it opens your phone's share menu. Elsewhere it offers "Share on WhatsApp" and "Copy link", and says "Link copied" when it's done. Sample kitchens are shared as "Sample kitchen on Tiffin Finder (made up for testing)".
- Each kitchen can have its own link that shows only its page: no other kitchens, filters or map, just a small "Listed on Tiffin Finder" line at the bottom. The For kitchens page explains it under "Copy your own link", with an example.
- A quiet "Report a problem with this listing" link is built and ready. It will open an email in your own email app with the kitchen's name filled in. It stays hidden until a public contact address is confirmed.
- The privacy page now explains the order panel, sharing, reporting, what's saved on your device and which outside services (GitHub Pages and Google Fonts) may handle requests outside Canada. It says a contact address for privacy questions will be added before launch. The terms cover the order panel, sharing, kitchens' own links and reports. Both are still drafts for a lawyer to review.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Round 10 — 2026-09-23

- Keyboard and screen-reader fixes: the close button on the preview notice stays full size on small phones, the neighbourhood headings read properly ("Northeast, 14 communities"), the Following page no longer repeats its status aloud, the install panel no longer has an invisible stop when you press Tab, and the home page no longer says it's loading when JavaScript is off.
- The information pages (About, For kitchens, How permits work, Terms, Privacy) now show their text before the app's script finishes loading, so they appear faster, especially on a slow connection.
- After each update, your browser always fetches the new styles and script instead of an older saved copy.
- The About page no longer has a form that couldn't send anything. It says contact details will be added at launch, and the links that pointed to the form now say so too.
- If you closed the preview notice, it no longer flashes for a moment when a page opens. After you save the alerts sign-up with the keyboard, you stay on its "Remove" button instead of losing your place.
- The kitchens are still made-up samples for testing, each marked "Sample".

## Update — 2026-09-23: contact email

- The "Report a problem with this listing" link is now switched on for every kitchen. It opens an email to sitesbyadeel@gmail.com in your own email app, with the kitchen's name filled in. Nothing is sent until you send it.
- The privacy page, the terms and the About page now give sitesbyadeel@gmail.com as the contact address.
- Service worker tf-v1.12.1.

## Overnight round 1 — 2026-09-24

- A full check of the site's code, offline support, wording, links, security and accessibility. Most things were already right; the fixes below are the ones that were confirmed.
- On the Following page, unfollowing a kitchen with the keyboard no longer drops your place: focus moves to the next kitchen's Follow button, or to the page heading when none are left.
- Before launch (samples switched off), the Following page now says plainly "Nothing to follow yet" under the "Launching in NE Calgary" heading, instead of silently showing the home page.
- The launch heading now reads "Launching in NE Calgary: permit-checked tiffin kitchens in one place", and the line under it no longer says kitchens are being checked right now. It says each kitchen is listed only after its permit is checked and it agrees, and that you order directly with the kitchen.
- The "Can I suggest a kitchen?" answer and the For kitchens page no longer say contact details are coming at launch; they point to the email address on the About page.
- The "Are these real kitchens?" question now reads "Are the kitchens on Tiffin Finder real?", so it still makes sense when no kitchens are showing.
- The "Price per day" choices now read "Under $12", "$12 – $13" and "$14 and up", so a kitchen above $15 a day is no longer filed under "$14 – $15". A kitchen with no day price no longer counts as "Under $12".
- The kitchens are still made-up samples for testing, each marked "Sample".
- Service worker tf-v1.13.0.

## Overnight round 2 — 2026-09-24

- Line endings are now locked down with a `.gitattributes` file, so text files always save with the same line endings whoever edits them.
- Added `robots.txt` and `sitemap.xml` so search engines can find the site's public pages (home, About, For kitchens, How permits work, Privacy, Terms). Sample-kitchen and demo pages are deliberately left out.
- Checked the dish glossary: 25 entries most likely to be vague or off were compared against real sources. One was fixed — "Bhuna khichuri" no longer names a specific meat inside a general definition; it now describes the drier, pilaf-like texture that "bhuna" means. The other 24 checked out and were left as they were.
- Checked the first 10 sample kitchen names against real Calgary and Airdrie food businesses. No name clashes were found, so no kitchen was renamed.
- The kitchens are still made-up samples for testing, each marked "Sample".
- Service worker tf-v1.14.0.

## Overnight round 3 — 2026-09-24

- New page: `guide.html`, "Tiffin 101: how to choose a tiffin service in Calgary" — a plain-language guide for households who haven't ordered tiffin before. It covers what a tiffin (dabba) service is and a short, sourced history; how daily/weekly/monthly plans and trial weeks usually work, and what's typically in a meal; how to choose a kitchen (spice level, veg/halal/Jain and allergens, portion and roti count, delivery days, containers and returns); a checklist of questions to ask a kitchen before you start; food-safety basics a household can check, with the real Health Canada numbers for keeping food cold and reheating it safely; a pointer to the dish glossary on kitchen pages; and a sources list.
- Every fact on the new page links to where it came from (Wikipedia for the tiffin/dabba/thali background, Health Canada for temperatures and timing), all checked 24 Sep 2026 and logged in `docs/research-notes.md`. Any price range on the page is labelled clearly as a typical range from this site's own sample listings, not a quote.
- The guide is now linked from the phone Menu sheet and the footer on every page, and added to the sitemap.
- The kitchens are still made-up samples for testing, each marked "Sample".
- Service worker tf-v1.15.0.

## Overnight round 4 — 2026-09-24

- Checked another 49 dish glossary entries (Afghan, Bengali, Hyderabadi, Nepali, Sri Lankan, Gujarati and Filipino), with extra attention to dietary claims. Seven were corrected: mantu and aushak now say what their toppings actually contain (aushak is often topped with a meat sauce, not just yogurt and mint); gotu kola sambol now notes it's traditionally made with dried fish; thukpa no longer implies meat is a fixed ingredient; kwati's "several kinds of beans" is now the correct "nine kinds"; puri is no longer sourced as if it were Gujarati-only; and menudo now mentions liver and is told apart from the unrelated Mexican dish of the same name. The other 42 checked out and were left as they were. Also checked the two sample kitchens marked Jain against their own sample menus: both already say up front that everything is cooked without onion, garlic or root vegetables, so no menu changes were needed.
- The Tiffin 101 guide is now linked from a new "New to tiffins?" question on the home page FAQ, from the pre-launch "coming soon" page, and from every kitchen page near its plans and prices.
- The kitchens are still made-up samples for testing, each marked "Sample".
- Service worker tf-v1.16.0.

## Overnight round 5 — 2026-09-24

- New tool: `tools/check_diet.py` (standard library only) cross-checks each sample kitchen's weekly menu against its own veg/Jain/halal flags, using the same dish glossary the kitchen pages already use. It found no contradictions in the current sample data — the two Jain kitchens already say up front, in their own description, that everything is cooked without onion, garlic or root vegetables, so the glossary matches on those menus don't count against them.
- To make that check possible, some dish glossary entries (`data/dishes.json`) now carry an optional `contains` tag (meat, fish, egg, dairy, onion or garlic, or root vegetable), set only where a dish's own description already says so. It changes nothing about how menus look on a kitchen page.
- The Tiffin 101 guide's "How to choose a kitchen" section has two new entries: allergens (Health Canada's list of 11 priority food allergens, and a note that a home-style kitchen may share spices, ghee or nuts across dishes, worth asking about) and Jain / no-onion-no-garlic cooking (what to ask a kitchen specifically: onion, garlic, root vegetables, when it was cooked, and shared pans). Sources are in `docs/research-notes.md`.
- The kitchens are still made-up samples for testing, each marked "Sample".
- Service worker tf-v1.17.0.
