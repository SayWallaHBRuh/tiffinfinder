# Security review — Round 19 (25 Sep 2026)

A skeptical pass over the site's security posture, plus copyright/ownership
protections. This is a static site on GitHub Pages: no server code, no
accounts, no payments, no database — most of the review is about the front
end (CSP, DOM safety, link handling, the service worker) and about the repo
itself (secrets, licence, hygiene).

## What was checked

1. Content-Security-Policy `<meta>` on every page: directives, inline-script
   hashes, `unsafe-inline`/`unsafe-eval` usage, `referrer` meta, HTTPS
   upgrade.
2. Clickjacking exposure (GitHub Pages can't send `X-Frame-Options` or
   `frame-ancestors`).
3. DOM/XSS safety: every place a URL parameter or JSON-sourced value reaches
   the DOM, and every dynamically built link (`href`, `mailto:`, `wa.me`,
   Google Maps).
4. `target="_blank"` link safety (`rel="noopener noreferrer"`).
5. `sw.js` (service worker): same-origin/GET-only caching, `response.ok`
   gating, cache-key handling, old-cache cleanup, scope.
6. Full git history of the `site/` repo for secrets, personal contact
   details and the old outreach phone number.
7. Repo hygiene: no stray build output, editor or tool folders tracked.
8. Whether `tools/check_ship.py` would have caught the issues found.

## Findings

### 1. CSP — pass, no changes needed
Every page's CSP already matches `README.md`'s documented policy:
`default-src 'self'; script-src 'self' <hashes>; style-src 'self' <hashes>
https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src
'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self';
base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests`. No `unsafe-inline`/`unsafe-eval` anywhere
(`check_ship.py` already enforces this). Every inline `<script>` block (the
`<base>` setters on 404.html/offline.html, and the speculation-rules blocks)
is hash-allowed, and the hashes still match after this round's edits
(re-verified with `check_ship.py`). `<meta name="referrer"
content="strict-origin-when-cross-origin">` was already present on every
page. `upgrade-insecure-requests` was already present. **No changes made.**

`frame-ancestors` is correctly *not* attempted via the meta CSP — a
meta-delivered CSP silently ignores that directive, and the README already
says so. Confirmed no page tries to set it via meta (which would be a no-op
that looks like protection but isn't).

### 2. Clickjacking — gap found and fixed
GitHub Pages cannot send `X-Frame-Options` or a `frame-ancestors` response
header, and a meta CSP can't substitute for it. Before this round there was
no mitigation at all: any page could be iframed by another site with no
warning to the visitor. Fixed with a same-origin JS mitigation, since the
site has nothing an attacker could steal via clickjacking (no login, no
payments) — this is a defence-in-depth/reassurance measure, not a critical
vulnerability fix:

- `app.js` now runs a break-out attempt as the very first thing it does
  (before any other code): if `window.top !== window.self`, it tries
  `window.top.location = window.location.href` in a `try/catch`.
- If that's blocked (a sandboxed iframe without `allow-top-navigation` can
  block it — tested and confirmed with a local sandboxed-iframe harness),
  `initFrameGuard()` — the first thing `initCommon()` calls — shows a small
  fixed warning bar built with `el()`/`textContent`/`setAttribute` (no
  `innerHTML`), with a link back to `https://tiffinfinder.ca/`
  (`target="_top" rel="noopener noreferrer"`). It never hides or blocks the
  rest of the page, so it can't break anything for the normal, unframed
  case (verified: no bar appears when the site loads normally).
- New CSS-only, no inline styles: `.frame-warning` in `styles.css`.
- No hash changes needed (no inline `<script>`/`<style>` blocks touched).

### 3. DOM/XSS safety — pass, no changes needed
All DOM construction goes through one helper (`el()` in `app.js`), which
uses `document.createElement`, `.textContent` and `.setAttribute` only.
Repo-wide search for `innerHTML`, `insertAdjacentHTML`, `eval(`,
`new Function`, `document.write`: zero matches in `app.js`, `early.js` or
any `*.html`. URL parameters (`?k`, `?q`, `?near`, `?type`, `?view`,
`?area`, `?service`, `?cuisine`, `?price`) and kitchen/dish JSON data are
consistently written via `textContent` or safe attributes, never
concatenated into markup strings.

`permit.source_url` — the one kitchen-supplied URL the site ever turns into
a link — is already validated to require `https://` in **two** independent
places before it can reach an `href`: `app.js` (both the listing gate around
line 667, and again when building the permit-info object around line 985,
which also re-parses with `new URL()` and checks `.protocol === 'https:'`)
and `tools/check_listings.py` (line ~210, `source_url.startswith('https://')`
is required for a real kitchen to pass the ship check). A `javascript:` or
`data:` value cannot pass either check. **No changes needed** — this was
already built correctly.

Other dynamic links (`mailto:` via the fixed `REPORT_EMAIL` constant,
`tel:` via digit-stripped numbers, Google Maps "Get directions" via
numeric, range-checked `lat`/`lon`, `wa.me` via digit-only phone numbers)
are all built from trusted, code-generated values, never raw external
strings.

### 4. Link safety — pass, plus a new automated check
Every static `target="_blank"` link in every page already carried
`rel="noopener noreferrer"`. Every JS-built one (`app.js`: Get directions ×2,
Share on WhatsApp, the permit source-url link, the order-send WhatsApp
button) also sets `rel: 'noopener noreferrer'` in the same `el()` call that
creates it. No changes needed to the links themselves, but
`tools/check_ship.py` had no automated check for this — see "check_ship.py"
below.

`mailto:` and `wa.me` message building already runs every dynamic piece of
text through `encodeURIComponent` (`app.js`: the report-a-problem mailto,
the Share panel's `wa.me/?text=`, and the order sheet's `wa.me/<digits>`
link).

### 5. Service worker — pass, no changes needed
Read the whole file. Confirmed:
- Only same-origin requests are ever intercepted (`if (url.origin !==
  self.location.origin) return;`) — cross-origin requests (Google Fonts,
  `wa.me`) are never touched.
- Only `response.ok` (and `response.type` of `basic`/`default`, excluding
  opaque/cors responses) is ever written to a cache — a failed or
  cross-origin response is never cached.
- Navigation and data-file cache keys are built from the URL with its query
  string and hash stripped (`stripSearch()`), but the response cached under
  that key always comes from fetching that exact same-origin request — a
  query string can't be used to get a different, attacker-chosen response
  cached under a clean-looking key. Versioned asset requests
  (`?v=<VERSION>`) are matched by the full request instead, so cache-busting
  on deploy still works.
- Old caches are deleted in `activate` (anything whose name isn't the
  current `SHELL_CACHE`/`DATA_CACHE`).
- Registered at the site root with no wider scope.

### 6. Git history / secrets scan
Searched the full history of the `site/` repo (the repo that becomes
tiffinfinder.ca) for API keys/tokens, personal phone numbers, emails other
than `sitesbyadeel@gmail.com`, home addresses, and specifically the retired
outreach number (`368-399-4499`, and digit-only/spaced variants). **Nothing
found** — the `site/` repo's history and working tree are clean.

One thing worth flagging to Adeel: `C:\tiffinfinder` (the folder *above*
`site/`) is a **separate** git repository (`tiffinfinder-handoff`, a
different remote) used for planning docs, the Sites by Adeel leads tracker,
and outreach message drafts. That repo does contain the retired outreach
number and other businesses' contact details in plain text (in
`plans/*.json`, `pages/kit.html`, `TIFFIN-FINDER-HANDOFF.md`) — expected,
since that's its job, and it never touches the published site. It isn't part
of this review's scope (it's not tiffinfinder.ca), but if that repo's
visibility or remote ever changes, that's the thing to check first.

### 7. Repo hygiene — pass, no changes needed
`.gitignore` already excludes `.claude/`, `__pycache__/` and `*.pyc`.
`git ls-files` confirms nothing under `design/`, `.claude/`, tool output, or
temp files is tracked in the `site/` repo.

## What was fixed this round

- Added a same-origin clickjacking mitigation (`app.js` break-out attempt +
  `initFrameGuard()` warning bar, `.frame-warning` in `styles.css`) — see
  finding 2.
- Extended `tools/check_ship.py` with two new automated checks so future
  rounds catch these by default:
  - Every `target="_blank"` link must carry `rel="noopener"` and
    `rel="noreferrer"` (would have caught a regression on finding 4).
  - The retired outreach phone number (`368-399-4499`, any
    spacing/punctuation) must never appear anywhere in the site (would have
    caught it landing on the site by accident, per rule 10 in the handoff).
- Part B (copyright/ownership, see below): `LICENSE`, `SECURITY.md`, a
  footer copyright line on every page, a "6. Our content and brand" section
  in `terms.html`, and a Copyright note in `README.md`.

## What was rejected (not a real issue)

Nothing was found that looked like a real, exploitable issue and was left
unfixed. The clickjacking gap (finding 2) is the only thing that was a
genuine gap rather than an already-correct pattern, and it's fixed above.

## What GitHub Pages can't do (needs Adeel's decision)

GitHub Pages serves this site with no way to set custom HTTP response
headers, so the following are simply not available while it stays on GitHub
Pages, whatever the code does:

- `X-Frame-Options` / a real `frame-ancestors` CSP directive (full
  clickjacking protection — the JS mitigation added this round is a
  same-origin fallback, not a replacement for this).
- `Strict-Transport-Security` (HSTS) — GitHub Pages does enforce HTTPS for
  custom domains, but without HSTS a visitor's very first request in a
  browsing session could still be silently upgraded rather than refused
  outright if HTTPS were ever unavailable.
- `X-Content-Type-Options: nosniff`.
- A CSP `report-uri`/`report-to` (so a blocked resource can only be seen in
  each visitor's own console, never reported back).

The plan already on record (`README.md`, `plans/protect-your-idea.md`) is to
put a service like **Cloudflare** in front of the domain later, which can
add all of the above as real response headers without moving off GitHub
Pages for hosting. That's a DNS-level change at Namecheap and is flagged, as
always, as something only Adeel decides and approves — not done here.

## Part B — protections added

- **`LICENSE`** (repo root): a plain-English "all rights reserved" notice —
  copyright (c) 2026 Adeel Ahmed (Tiffin Finder), no licence granted to copy
  or reuse the code/text/logo/illustrations/data, except the City of
  Calgary, City of Airdrie open-data licences (kept exactly as the site
  already names them) and Google Fonts' SIL Open Font License, which are
  unaffected.
- **Footer** on every page: "© 2026 Tiffin Finder · Calgary, Alberta. All
  rights reserved." (kept the existing line, added "All rights reserved.").
  404.html and offline.html only changed the text inside an existing `<p>`,
  not their inline `<style>` blocks, so no CSP hash recompute was needed —
  confirmed by `check_ship.py`.
- **`terms.html`**: renamed and expanded section 6 to "Our content and
  brand" — the site's text, design, code, logo and mascot illustration
  belong to Tiffin Finder and aren't to be copied or reused without written
  permission; kitchen listings stay owned by the kitchens; the City of
  Calgary / City of Airdrie open-data attribution stays. Kept the existing
  "Draft — to be reviewed by a lawyer" note.
- **`SECURITY.md`** (repo root): how to report a security problem
  (sitesbyadeel@gmail.com), what to include, no bug-bounty promise.
- **`README.md`**: a short "Copyright" section pointing to `LICENSE`.

None of this required spending money, filing anything with CIPO/Alberta, or
any DNS change — per `plans/protect-your-idea.md`'s "free, do now" list.
