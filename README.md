# Tiffin Finder

Tiffin Finder is a Calgary directory of permit-checked home tiffin kitchens: households browse by quadrant, cuisine and price, open a kitchen to see this week's menu, follow it, and order by WhatsApp or phone directly with the kitchen. This is phase one: a read-only static PWA (no accounts, ordering, payments or delivery) built with plain HTML, CSS and JavaScript, and **`data/kitchens.json` is sample data** — fictional kitchens with 403-555-01xx numbers, labelled "Sample" on every card; real kitchens are added only after their permit is checked and with their permission.

The live site is **<https://tiffinfinder.ca>** (the `CNAME` file points GitHub Pages at it; leave that file as it is).

## What it does

- **Browse, search and filter.** Search dishes, kitchens or areas, and filter by quadrant (NE, NW, SE, SW, Airdrie), pickup or delivery, cuisine, price, veg, halal, Jain, "Trial week", "Taking new customers" and near a neighbourhood (`?near=`). The filters live in the address, so a filtered list can be reloaded or shared.
- **A pickup-first map** (Rounds 4 and 5). Each kitchen that offers pickup gets a pin at the spot it chose to share; pins that sit too close join into one numbered pin, and tapping a pin opens a small preview card. The map's files download only when someone opens the map.
- **Kitchen pages.** This week's menu with the dish glossary (a dotted dish name opens a one-line description), plans and prices, the permit line ("Permit checked" kitchens show "Permit status checked on <date>."; samples show "Sample listing" instead), and the pickup spot or delivery areas.
- **Follow and alerts, on this device only.** Follow a kitchen to find it again under "Following", and leave an email for alerts at launch. Both are saved in this browser only; nothing is sent.
- **The order hand-off sheet** (Rounds 6 and 7). "Order on WhatsApp" and "Call" open a sheet with a message view and a call view. The message is built by `orderMessage()` in `app.js` and always starts "Hi, I found you on Tiffin Finder." Nothing is sent until the household sends it from their own WhatsApp or phone.
- **Sample switch, demo and launch page** (Round 6). `show_samples` in `data/kitchens.json` hides the sample kitchens and shows the "Launching in NE Calgary" page; `?demo=1` shows the samples anyway. Every sample shows "Sample" / "Sample listing".
- **The permit guide** (`permitted.html`, Round 8): what a home tiffin kitchen needs in Calgary, framed as "confirm with AHS" and "not legal advice".
- **Tiffin 101** (`guide.html`, overnight round 3): a plain-language guide for households new to tiffin — what a tiffin service is, how plans and prices usually work, how to choose one, questions to ask a kitchen, and food-safety basics, all sourced and linked from `docs/research-notes.md`.
- **Fresh pages, Share, a kitchen's own link and the report link** (Round 9). Pages are network-first; every kitchen page has Share; `?k=<slug>&solo=1` shows only that kitchen; and a "Report a problem with this listing" link stays hidden until a public contact address is set.
- **Installable and offline.** Add it to the home screen; saved pages and the last kitchen list work without a connection.
- **Round 10:** an accessibility pass (keyboard and screen-reader fixes), and versioned CSS/JS (`?v=<VERSION>`), so an update never serves old styles or scripts. The About page has no contact form (the contact email was added later, see the Update entry in CHANGELOG.md).

## Run locally

```
cd tiffinfinder
python -m http.server 8000
```

Open <http://localhost:8000/>. (The service worker registers on `localhost` and `https:` only.)

## Deploy to GitHub Pages

1. Push this folder to a repository (for example `tiffinfinder`) on the `main` branch.
2. In the repo, open **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. The site is served at the custom domain in `CNAME` (<https://tiffinfinder.ca>), and also works at `https://<your-user>.github.io/tiffinfinder/`.
4. When you change any file, bump `VERSION` in `sw.js`, and set the same value in the `?v=` on `styles.css`, `app.js` and `early.js` in every page (index, about, kitchens, permitted, guide, privacy, terms, 404, offline), so visitors never get old styles or scripts.

## Showing or hiding the sample kitchens

The made-up sample kitchens can be switched off in one place, for example when the site is about to launch. With them off, the home page shows a "Launching in NE Calgary" page (with "List your kitchen, free" and "See how it works") until real kitchens are added. The map address shows the same page, and the Following page shows it with a short "Nothing to follow yet" note under it.

1. On GitHub, open `data/kitchens.json` and click the pencil (**Edit**).
2. Near the top, find `"show_samples": true`.
3. Change `true` to `false`, with no quote marks.
4. Click **Commit changes**.
5. Within a few minutes <https://tiffinfinder.ca> shows the "Launching in NE Calgary" page instead of the samples, and installed copies pick it up the next time they're online.
6. To look at the samples anyway, open <https://tiffinfinder.ca/?demo=1>. It shows a "Demo" banner and asks search engines not to list it.
7. To undo, set it back to `true`.

Real kitchens (those without `"sample": true`) always show, whatever the switch says. If `show_samples` is missing, the samples show.

## Addresses the app understands

The home page (`./`) reads these from the address:

- `?k=<slug>` opens a kitchen, for example `./?k=saffron-lane-rasoi`.
- `?view=following` shows the kitchens you follow.
- `price=low|mid|high` is the "Price per day" filter: under $12, $12 to $13 (up to $13.99), and $14 and up. A kitchen with no day price matches none of them.
- Otherwise it shows the list, with any filters: `?q=<search>&area=NE|NW|SE|SW|Airdrie&service=pickup|delivery&near=<community>&cuisine=<name>&price=low|mid|high&veg=1&halal=1&jain=1&trial=1&open=1`. Filters left at their default are left out, so the plain list is just `./`. Changing a filter updates the address in place (no extra Back steps), so a filtered list can be reloaded or shared.
- `trial=1` is the "Trial week" switch: only kitchens that offer a trial week. `open=1` is the "Taking new customers" switch: only kitchens whose `capacity` is `"open"` and that can take orders (permit checked, or a sample). Both count in "N filters on" and are cleared by "Reset filters"; `true`, `yes` and `on` work too.
- `service=pickup` shows the kitchens that offer pickup (pickup-only, and pickup & delivery); `service=delivery` shows the kitchens that deliver (delivery-only, and pickup & delivery). It is the "Pickup / Delivery" chips under the quadrants, and the value is read in any case (`service=Pickup` works). Anything else means all kitchens.
- `near=<community>` shows the kitchens with pickup or delivery in that community, for example `./?near=saddle-ridge`: kitchens that deliver there, and kitchens whose pickup spot is there. A "Pickup or delivery in Saddle Ridge" pill above the list removes it. The community is written in lowercase letters and numbers, with apostrophes removed and any other characters, such as spaces, turned into a single hyphen ("King's Heights" becomes `kings-heights`, "McKenzie Towne" becomes `mckenzie-towne`). A community no kitchen serves is ignored. The delivery areas and the "See it on the map" button on each kitchen's page, and the "Browse by neighbourhood" section on the home page, link to it.
- Search also matches delivery communities, pickup spots (without the "Sample location ·" prefix) and the words "pickup" and "delivery", ignoring case, apostrophes and hyphens, so `saddle-ridge` and `kings heights` both work.
- `?demo=1` is the demo: every kitchen shows, samples included, even when `show_samples` is `false`. A "Demo" banner says the kitchens are made up, the page asks search engines not to list it (`noindex`), and the links inside the app keep `demo=1` so you stay in the demo. "Leave demo" goes back to the normal home page. `demo=true`, `yes` and `on` work too.
- `view=map` opens the map instead of the list, for example `./?view=map&area=NE`. Filters apply to the map too, and a quadrant zooms it in. The list is the default, so it has no `view=` at all. The "List" / "Map" switch above the results updates the address in place like a filter, so the "All kitchens" tab and a kitchen's back link return to the map when it was showing. `?k=` always wins over `view=map`, and any other `view=` value (except `following`) shows the list.
- `solo=1` with `?k=<slug>` is a kitchen’s own link: only that kitchen shows. There is no hero, list, filters, tabs, map, neighbourhoods, FAQ, alerts, back link, header menu or site links. Delivery areas are plain text, the header logo isn't a link, and the footer is one quiet line: “Listed on Tiffin Finder · Terms · Privacy”. The order sheet, Share (which shares the solo link), the permit line and the report link still work. It works with `demo=1`, which hides “Leave demo”. `?solo=1` without `k` is ignored.

## Data

- `data/kitchens.json` is **sample data**: fictional kitchens with 403-555-01xx numbers, labelled "Sample" on every card.
- `meta.show_samples` (the first key in `meta`) switches the sample kitchens (`"sample": true`) on or off; see "Showing or hiding the sample kitchens" above. Only `false` (or `0`, or the text `"false"`, `"no"`, `"off"` or `"0"`) hides them.
- Each kitchen has a `permit` object: `{"status", "checked_on", "expires", "source_url", "method"}`.
  - `status` is `"verified"` once the permit has been checked, or `"pending"` while it's still being checked.
  - `checked_on` (`YYYY-MM-DD`) is the day we checked it. Older entries may have `verified_on` instead; it is used when `status` is `"verified"` and there is no `checked_on`. With no valid date, or a date in the future, the kitchen shows "Verification pending" and ordering stays closed.
  - `expires` (`YYYY-MM-DD`) is the permit's expiry date, if known. Once that date is before today, the kitchen shows "Permit being re-checked", ordering is paused ("Ordering paused"), and it isn't counted as permit-checked. A kitchen whose expiry date is today still counts. A value that isn't a real date is treated as expired, so fix it rather than guess. With no `expires` at all, no expiry is known and the kitchen stays "Permit checked".
  - `source_url` (optional) is a link to the public record, starting with `https://`. It shows as "See the public record" on the kitchen's page.
  - `method` (optional, up to 120 characters) is a short note shown as "How we checked: …".
  - The badge reads "Permit checked · <date>". The page also says "Not a food-safety inspection or endorsement." `permit_type` can stay in the data but isn't shown.
- A sample kitchen (`"sample": true`) always shows "Sample listing" and never any permit wording, whatever its `permit` says. Its page has an "About this listing" section instead of "Permit". The order sheet opens for samples, but shows "This is a sample kitchen, so there’s no one to message yet" instead of any WhatsApp or call link.
- Ordering. A kitchen's page has "Order on WhatsApp" ("Join the waitlist" when `capacity` is `"waitlist"`, "Ask to join the waitlist" when it is `"full"`) and "Call" buttons. Neither is a link: both open the order sheet ("You’re about to send"), where the household picks a plan (only the plans the kitchen has prices for) and a start day (the next five weekdays; hidden when joining a waitlist), can add a note of up to 140 characters (with a reminder not to add their address), and sees the exact message before tapping "Send on WhatsApp". "Call instead" switches to "Before you call": the phone number, the same words as a short script, and a "Call <number>" link. A kitchen with no WhatsApp number opens straight on the call script. The choices stay in memory for that kitchen until the page reloads; nothing is saved or sent anywhere except the household's own WhatsApp or phone. The sheet closes with Escape, the X or a tap outside it, and after Send or Call.
- Every prefilled message is built in one place in `app.js` (`orderMessage`) and always starts "Hi, I found you on Tiffin Finder.", so a kitchen can tell who found it here, for example "Hi, I found you on Tiffin Finder. I’d like the weekly plan starting Mon 28 Sep. Less spicy please." It never adds a phone number, address or name. The note is cleaned first (control and text-direction characters removed, spaces collapsed, cut to 140 characters).
- `trial` (optional, right after `price`) is `{"offered": true | false, "price": <number> | null, "note": <text> | null}`. When `offered` is `true`, the card and the map preview show a "Trial week $N" chip (just "Trial week" without a price), the kitchen's "Plans and prices" table gets a "Trial week" row (its price, or "Ask the kitchen") with the note (1 to 120 characters) under it, and the trial week is a plan in the order sheet when it has a price. The price must be above 0 and under 1000; anything else counts as no price.
- `capacity` (optional, right after `trial`) is `"open"`, `"waitlist"` or `"full"`. It shows as "Taking new customers", "Waitlist" or "Full right now" on the card, in the map preview and beside the order heading, and changes the order button's label (see Ordering). It shows only while ordering is open (permit checked, or a sample); a pending or re-checking kitchen never shows it. Missing or any other value means unknown and shows nothing.
- Cards show the day, week and month prices on one line ("From $13/day · $75/week · $260/month", from `price.day`, `price.weekly` and `price.monthly`), and a badge row of at most three: "Sample listing" or the permit badge, one diet word (Jain, else Veg, else Halal), then the capacity. Pickup or delivery is in the line under the name. A map preview (tap a pin) shows the same badge row, and its line under the name holds the cuisine, quadrant, day price, the "Pickup" / "Delivery" / "Pickup & delivery" chip and, last, the trial week; a kitchen with no day price shows no "/day" at all.
- The sample kitchens' `trial` and `capacity` are made up by `python tools/sample_decisions.py` (standard library only; run it from the `tiffinfinder` folder). It changes only kitchens with `"sample": true`: about 60% "open", 25% "waitlist" and the rest "full" (14 / 6 / 4 for 24 samples), and half of the samples (never a full one) offer a trial week at 85% of the weekly price, some with the note "Five weekday tiffins, one trial week per household.". It picks with hashes of the slugs, so running it again gives a byte-identical file, and it keeps the file's newline style. It stops with an error, naming the kitchen, if a check fails.
- `data/dishes.json` is the dish glossary shown on kitchen pages: a dish name on a menu that matches one of an entry's `terms` gets a dotted underline and opens that entry's one-line description. If the file can't load, menus show as plain text.
- A dish entry can optionally carry `contains`: a list drawn from `"meat"`, `"fish"`, `"egg"`, `"dairy"`, `"onion_garlic"`, `"root_veg"`, set only where the dish's own description (or the Jain-diet research in `docs/research-notes.md`) clearly says so. It's optional and conservative — most dishes have none, meaning "not checked," not "contains nothing" — and `app.js` never reads it (the glossary lookup only uses `id`, `name`, `description` and `terms`, so an unknown or missing field on a dish is always safely ignored).

### Tools

- **`tools/check_diet.py`** (standard library only; `python tools/check_diet.py` from the `tiffinfinder` folder) cross-checks each kitchen's sample menu against its own `veg_only`, `jain` and `halal` flags, using the same dish-glossary term matching as the kitchen page (`data/dishes.json`). It flags a `veg_only` kitchen whose menu names a dish tagged `meat`, `fish` or `egg`; a `jain` kitchen whose menu names a dish tagged `onion_garlic` or `root_veg`, unless the kitchen's own description already says its food is prepared the Jain way (no onion, no garlic, no root vegetables); and prints a plain reminder — never a pass/fail claim — that `halal` can't be checked from dish names alone. It exits non-zero if it finds a contradiction, or if `contains` holds anything other than the categories above.
- `tools/sample_pickup.py` and `tools/sample_decisions.py` (both standard library only, described above) fill in the sample kitchens' pickup points, trial weeks and capacity deterministically.
- `docs/research-notes.md` lists the sources for community names, quadrants and dish descriptions, and the official pages behind the permit guide (`permitted.html`). Delivery communities must come from the lists named there, with each community in one quadrant only.
- `data/map/calgary.json` and `data/map/airdrie.json` are the map shapes (Calgary communities and Airdrie neighbourhoods as ready-made SVG paths), from the City of Calgary's and City of Airdrie's open data. `docs/map-data.md` explains where they come from, their licences and how to refresh them. The map must always show the two credit lines under it ("Contains information licensed under the Open Government Licence – City of Calgary." and "Contains information licensed under the Open Data Licence – City of Airdrie."), and must not use either City's logo.
- Each kitchen has an `area` (its own community, as the kitchen spells it) and a `base_community` (`{"city": "calgary" | "airdrie", "slug": "<community>"}`) for the same community, so the slug of `area` equals `base_community.slug`. The community must exist in the matching map file, and an Airdrie kitchen (quadrant `Airdrie`) must use `airdrie`.
- `service` is `"pickup"`, `"delivery"` or `"both"`, and sits right after `base_community`, followed by `pickup`. Every kitchen also keeps `delivery` (`{"areas": [...], "notes": "..."}`); a pickup-only kitchen has `"areas": []` and `"notes": ""`. The app trusts `service` only when the data backs it (pickup needs a valid `pickup`, delivery needs at least one delivery area) and otherwise falls back to what is there; a kitchen with neither is not shown.
- `pickup` is `null` for a delivery-only kitchen, or `{"precision", "label", "point", "lat", "lon", "notes"}`:
  - `precision` is how the kitchen chose to share its spot: `"exact"` (its address), `"intersection"` (the nearest intersection) or `"community"` (its neighbourhood only).
  - `label` (1 to 80 characters) is only the place text, such as `Saddletowne Circle NE`. The app adds the verb: "Pickup at …" (exact), "Pickup near …" (intersection), or "Pickup in <area>" (community, with the label as fine print under it).
  - `point` is `[x, y]` (one decimal) in the coordinate frame of the city's own map file: `data/map/calgary.json` for Calgary, the raw `data/map/airdrie.json` frame for Airdrie (the app adds the Airdrie offset itself). It must fall inside the kitchen's base community.
  - `lat` and `lon` are used only for the "Get directions" link (Google Maps), which shows only when `precision` is `exact` or `intersection`, both are numbers, `lat` is between 50.6 and 51.5 and `lon` is between -114.5 and -113.6. A neighbourhood-only kitchen never gets a directions link. Otherwise `lat` and `lon` are `null`.
  - `notes` is optional text such as pickup times.
- The sample kitchens all use `"precision": "community"`, the label `Sample location · <area>`, `lat`/`lon` `null`, and made-up points inside their neighbourhood placed by `python tools/sample_pickup.py` (standard library only; it rewrites `data/kitchens.json` the same way every time, keeps the file's newline style, and stops with an error if a point can't be placed well inside its community). `meta.pickup_note` says so. There are no street locations in the sample data.
- On the map, a kitchen that offers pickup gets its own pin at its `pickup.point`; the app leaves it off the map (with a note under it) if its `area` isn't its base community or the point is outside that community. A delivery-only kitchen has no spot to show: its outlined pin sits on the middle of its base community, which must be one of its own delivery areas. Pins closer than 44px on screen join into one numbered pin. Pickup pins show the spot each kitchen chose to share, at the precision it chose, and never more.

### Sharing and reporting

- Every kitchen's page has a **Share** button. The link it shares is built by `shareUrl` in `app.js`: the absolute address of the kitchen's page, `?k=<slug>`, plus `solo=1` on a kitchen's own link and `demo=1` in the demo. It never carries the filters, `view=` or `near=`.
- The share text is built in one place (`shareText` / `shareLead`): "<Kitchen name> on Tiffin Finder: <link>", or "Sample kitchen on Tiffin Finder (made up for testing): <link>" for a sample kitchen. `shareLead` is the part before the colon; the kitchen name is cleaned first (control and text-direction characters removed, spaces collapsed).
- Where the device has its own share menu (`navigator.share`, most phones), Share opens it with the title, `shareLead` as the text and the link as a separate `url`, because share targets add the link themselves (passing the full text would show the link twice). Cancelling does nothing; any other failure falls back to the panel below.
- Elsewhere, Share shows and hides a small panel under the kitchen's buttons: "Share on WhatsApp" (a `https://wa.me/?text=` link with no number, carrying `shareText`, opening in a new tab) and "Copy link", which copies the link and says "Link copied". Where the clipboard can't be used, the link appears selected in a box, ready to copy by hand. Escape, a click outside or Share again closes the panel.
- A share goes to a friend, not to the kitchen, so it never goes through `orderMessage` and never starts "Hi, I found you on Tiffin Finder.". Links to a kitchen (`wa.me/<digits>`) always carry `orderMessage`; links with no number (`wa.me/?text=`) always carry `shareText`.
- At the end of the permit section ("About this listing" for a sample), every kitchen's page has a quiet **Report a problem with this listing** link, also on a kitchen's own link. It is a `mailto:` link (`reportHref`) addressed to `REPORT_EMAIL` in `app.js` (sitesbyadeel@gmail.com, approved by the owner as the public contact; setting it to '' hides the link), with the subject "Problem with listing: <Kitchen name> (<slug>)" and a short body: a list of problems to keep or delete (closed or no longer taking orders, permit, wrong information, food safety concern, other), a space for details, the link to the listing, and the AHS Environmental Public Health number (1-833-476-4743) for urgent food-safety concerns. The same address is written out in `privacy.html` and `terms.html`, so change all three together.
- Nothing is sent automatically: sharing, copying and reporting all happen in the household's own apps, and Tiffin Finder is never told about them.

## Paths

All paths are relative (no leading `/`), so the same files work at the custom domain, at a GitHub Pages project URL, or in a subfolder. The only absolute URLs are the `canonical`, `og:url`, `og:image` and `twitter:image` tags, which point at `https://tiffinfinder.ca/`. `404.html` and `offline.html` each set their own `<base>` from the address at load, so they render correctly at any depth (a mistyped address, or any address opened offline).

On the static pages (about, kitchens, permitted, privacy, terms, 404, offline), the small `early.js` runs in `<head>` before first paint (the saved theme and a dismissed preview notice) and `app.js` is loaded with `defer`, so the text shows without waiting for the script. `index.html` keeps `app.js` blocking on purpose: it decides the route, a kitchen's own link, demo mode and the loading hero before first paint (and applies the saved theme and a dismissed preview notice itself), so a shared kitchen link never flashes the home page first.

## Security headers

GitHub Pages can't set response headers, so every page (including `tools/og.html`) carries a Content-Security-Policy `<meta>` and a referrer `<meta>` (`strict-origin-when-cross-origin`), straight after `<meta charset="utf-8">` and before any script, style or link. The policy lets pages load only Tiffin Finder's own files plus Google Fonts:

```
default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
```

- `404.html` and `offline.html` each keep one inline script (the `<base>` setter, which has to run before any relative URL is read, so it can't be a separate file) and one inline critical style (for JavaScript-off at deep paths). Their policies allow exactly those two blocks by hash: `script-src 'self' 'sha256-…'` and `style-src 'self' 'sha256-…' https://fonts.googleapis.com`, with every other directive the same as above. If you edit either block, recompute its hash over the exact text between the tags and update that page's CSP meta (and any check script you use). From the `tiffinfinder` folder:

  ```
  python -c "import re,hashlib,base64;s=open('404.html',encoding='utf-8',newline='').read();[print(t,base64.b64encode(hashlib.sha256(re.search('<%s>(.*?)</%s>'%(t,t),s,re.S).group(1).encode('utf-8')).digest()).decode()) for t in ('script','style')]"
  ```

  (Swap `404.html` for `offline.html` for the other page. The files use LF line endings, as served; a CRLF copy gives a different hash.)
- Nothing may use `'unsafe-inline'`, `'unsafe-eval'` or `'unsafe-hashes'`. No `style="…"` attributes and no inline `on…=` handlers in the markup; style changes from `app.js` go through the CSSOM (`element.style.setProperty`, `.style.left` and so on), which the policy allows.
- A CSP delivered by `<meta>` ignores `frame-ancestors`, `report-uri` and `sandbox`. Clickjacking protection (`frame-ancestors`), `Strict-Transport-Security` (HSTS) and `X-Content-Type-Options` need real response headers; that is planned for a later move behind Cloudflare.
- Open a page and check the browser console: any blocked resource shows as a "Content Security Policy" message.

The sources behind the Round 8 permit guide (`permitted.html`) are listed in `docs/research-notes.md`.

## Offline

Pages are network-first: the service worker asks the network for the latest page and saves it, and uses the saved copy (or `offline.html` if there is none) only when the network fails or takes longer than about 3 seconds. Styles, `early.js`, the script and icons come from the saved copy first; the pages ask for `styles.css`, `app.js` and `early.js` as `<file>?v=<VERSION>` (the same value as `VERSION` in `sw.js`), so a new deploy uses new addresses and never gets an older saved copy. Meanwhile `data/kitchens.json`, `data/dishes.json` and the map files are network-first with the last saved copy as the fallback. Both data files (`data/kitchens.json` and `data/dishes.json`) are network-first: the latest copy when online, the last saved copy when not. If there is no saved kitchen list, the page shows a "You're offline" state that retries by itself when the connection comes back; if there is no saved glossary, menus show as plain text. The map files (`data/map/*.json`) are network-first too, but they are not part of the saved app shell: they are downloaded only when someone first opens the map, and saved from then on. Opening the map for the first time with no connection shows a "You're offline" message on the map, with Try again and a button back to the list. The very first visit needs a connection: until the service worker is installed, the browser shows its own offline page.

## Link previews

Pages carry Open Graph and Twitter tags, so links shared on WhatsApp, Facebook, iMessage and similar show a card with `og-image.png` (1200×630, keep it under 300 KB for WhatsApp). The image is rendered from `tools/og.html` (styled by `tools/og.css`, so it passes its own Content-Security-Policy; neither file is part of the offline app shell) with headless Microsoft Edge (Chrome takes the same flags). Run this in Command Prompt from the `tiffinfinder` folder; it uses a throwaway profile folder, not your own:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --user-data-dir="%TEMP%\edge-og" --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=5000 --screenshot="%CD%\og-image.png" "file:///%CD:\=/%/tools/og.html"
```

Edge saves about 370 KB, which is over WhatsApp's 300 KB limit, so the committed file was re-saved losslessly (same pixels, PNG "Sub" row filter) to about 250 KB. Any lossless PNG re-save that gets it under 300 KB works. Kitchen links (`?k=`) share the home page's preview, because link-preview crawlers don't run JavaScript.

## Icons

Icons are generated by `python tools/make_icons.py` (uses Pillow if present, otherwise a built-in pure-Python PNG writer).
