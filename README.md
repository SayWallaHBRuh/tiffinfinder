# Tiffin Finder

Tiffin Finder is a Calgary directory of permit-checked home tiffin kitchens: households browse by quadrant, cuisine and price, open a kitchen to see this week's menu, follow it, and order by WhatsApp or phone directly with the kitchen. This is phase one: a read-only static PWA (no accounts, ordering, payments or delivery) built with plain HTML, CSS and JavaScript, and **`data/kitchens.json` is sample data** — fictional kitchens with 403-555-01xx numbers, labelled "Sample" on every card; real kitchens are added only after their permit is checked and with their permission.

The live site is **<https://tiffinfinder.ca>** (the `CNAME` file points GitHub Pages at it; leave that file as it is).

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
4. When you change any file, bump `VERSION` in `sw.js` so installed copies pick up the new shell.

## Showing or hiding the sample kitchens

The made-up sample kitchens can be switched off in one place, for example when the site is about to launch. With them off, the home page shows a "Launching in NE Calgary" page (with "List your kitchen, free" and "See how it works") until real kitchens are added.

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
- Otherwise it shows the list, with any filters: `?q=<search>&area=NE|NW|SE|SW|Airdrie&service=pickup|delivery&near=<community>&cuisine=<name>&price=low|mid|high&veg=1&halal=1&jain=1&trial=1&open=1`. Filters left at their default are left out, so the plain list is just `./`. Changing a filter updates the address in place (no extra Back steps), so a filtered list can be reloaded or shared.
- `trial=1` is the "Trial week" switch: only kitchens that offer a trial week. `open=1` is the "Taking new customers" switch: only kitchens whose `capacity` is `"open"` and that can take orders (permit checked, or a sample). Both count in "N filters on" and are cleared by "Reset filters"; `true`, `yes` and `on` work too.
- `service=pickup` shows the kitchens that offer pickup (pickup-only, and pickup & delivery); `service=delivery` shows the kitchens that deliver (delivery-only, and pickup & delivery). It is the "Pickup / Delivery" chips under the quadrants, and the value is read in any case (`service=Pickup` works). Anything else means all kitchens.
- `near=<community>` shows the kitchens with pickup or delivery in that community, for example `./?near=saddle-ridge`: kitchens that deliver there, and kitchens whose pickup spot is there. A "Pickup or delivery in Saddle Ridge" pill above the list removes it. The community is written in lowercase letters and numbers, with apostrophes removed and any other characters, such as spaces, turned into a single hyphen ("King's Heights" becomes `kings-heights`, "McKenzie Towne" becomes `mckenzie-towne`). A community no kitchen serves is ignored. The delivery areas and the "See it on the map" button on each kitchen's page, and the "Browse by neighbourhood" section on the home page, link to it.
- Search also matches delivery communities, pickup spots (without the "Sample location ·" prefix) and the words "pickup" and "delivery", ignoring case, apostrophes and hyphens, so `saddle-ridge` and `kings heights` both work.
- `?demo=1` is the demo: every kitchen shows, samples included, even when `show_samples` is `false`. A "Demo" banner says the kitchens are made up, the page asks search engines not to list it (`noindex`), and the links inside the app keep `demo=1` so you stay in the demo. "Leave demo" goes back to the normal home page. `demo=true`, `yes` and `on` work too.
- `view=map` opens the map instead of the list, for example `./?view=map&area=NE`. Filters apply to the map too, and a quadrant zooms it in. The list is the default, so it has no `view=` at all. The "List" / "Map" switch above the results updates the address in place like a filter, so the "All kitchens" tab and a kitchen's back link return to the map when it was showing. `?k=` always wins over `view=map`, and any other `view=` value (except `following`) shows the list.

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
- `trial` (optional, right after `price`) is `{"offered": true | false, "price": <number> | null, "note": <text> | null}`. When `offered` is `true`, the card shows a "Trial week $N" chip (just "Trial week" without a price), the kitchen's "Plans and prices" table gets a "Trial week" row (its price, or "Ask the kitchen") with the note (1 to 120 characters) under it, and the trial week is a plan in the order sheet when it has a price. The price must be above 0 and under 1000; anything else counts as no price.
- `capacity` (optional, right after `trial`) is `"open"`, `"waitlist"` or `"full"`. It shows as "Taking new customers", "Waitlist" or "Full right now" on the card and beside the order heading, and changes the order button's label (see Ordering). It shows only while ordering is open (permit checked, or a sample); a pending or re-checking kitchen never shows it. Missing or any other value means unknown and shows nothing.
- Cards show the day, week and month prices on one line ("From $13/day · $75/week · $260/month", from `price.day`, `price.weekly` and `price.monthly`), and a badge row of at most three: "Sample listing" or the permit badge, one diet word (Jain, else Veg, else Halal), then the capacity. Pickup or delivery is in the line under the name.
- The sample kitchens' `trial` and `capacity` are made up by `python tools/sample_decisions.py` (standard library only; run it from the `tiffinfinder` folder). It changes only kitchens with `"sample": true`: about 60% "open", 25% "waitlist" and the rest "full" (14 / 6 / 4 for 24 samples), and half of the samples (never a full one) offer a trial week at 85% of the weekly price, some with the note "Five weekday tiffins, one trial week per household.". It picks with hashes of the slugs, so running it again gives a byte-identical file, and it keeps the file's newline style. It stops with an error, naming the kitchen, if a check fails.
- `data/dishes.json` is the dish glossary shown on kitchen pages: a dish name on a menu that matches one of an entry's `terms` gets a dotted underline and opens that entry's one-line description. If the file can't load, menus show as plain text.
- `docs/research-notes.md` lists the sources for community names, quadrants and dish descriptions. Delivery communities must come from the lists named there, with each community in one quadrant only.
- `data/map/calgary.json` and `data/map/airdrie.json` are the map shapes (Calgary communities and Airdrie neighbourhoods as ready-made SVG paths), from the City of Calgary's and City of Airdrie's open data. `docs/map-data.md` explains where they come from, their licences and how to refresh them. The map must always show the two credit lines under it ("Contains information licensed under the Open Government Licence – City of Calgary." and "Contains information licensed under the Open Data Licence – City of Airdrie."), and must not use either City's logo.
- Each kitchen has an `area` (its own community, as the kitchen spells it) and a `base_community` (`{"city": "calgary" | "airdrie", "slug": "<community>"}`) for the same community, so the slug of `area` equals `base_community.slug`. The community must exist in the matching map file, and an Airdrie kitchen (quadrant `Airdrie`) must use `airdrie`.
- `service` is `"pickup"`, `"delivery"` or `"both"`, and sits right after `base_community`, followed by `pickup`. Every kitchen also keeps `delivery` (`{"areas": [...], "notes": "..."}`); a pickup-only kitchen has `"areas": []` and `"notes": ""`. The app trusts `service` only when the data backs it (pickup needs a valid `pickup`, delivery needs at least one delivery area) and otherwise falls back to what is there; a kitchen with neither is not shown.
- `pickup` is `null` for a delivery-only kitchen, or `{"precision", "label", "point", "lat", "lon", "notes"}`:
  - `precision` is how the kitchen chose to share its spot: `"exact"` (its address), `"intersection"` (the nearest intersection) or `"community"` (its neighbourhood only).
  - `label` (1 to 80 characters) is only the place text, such as `Saddletowne Circle NE`. The app adds the verb: "Pickup at …" (exact), "Pickup near …" (intersection), or "Pickup in <area>" (community, with the label as fine print under it).
  - `point` is `[x, y]` (one decimal) in the coordinate frame of the city's own map file: `data/map/calgary.json` for Calgary, the raw `data/map/airdrie.json` frame for Airdrie (the app adds the Airdrie offset itself). It must fall inside the kitchen's base community.
  - `lat` and `lon` are used only for the "Get directions" link (Google Maps), which shows only when `precision` is `exact` or `intersection`, both are numbers, `lat` is between 50.6 and 51.5 and `lon` is between -114.5 and -113.6. A neighbourhood-only kitchen never gets a directions link. Otherwise `lat` and `lon` are `null`.
  - `notes` is optional text such as pickup times.
- The sample kitchens all use `"precision": "community"`, the label `Sample location · <area>`, `lat`/`lon` `null`, and made-up points inside their neighbourhood placed by `python tools/sample_pickup.py` (standard library only; it rewrites `data/kitchens.json` the same way every time, and stops with an error if a point can't be placed well inside its community). `meta.pickup_note` says so. There are no street locations in the sample data.
- On the map, a kitchen that offers pickup gets its own pin at its `pickup.point`; the app leaves it off the map (with a note under it) if its `area` isn't its base community or the point is outside that community. A delivery-only kitchen has no spot to show: its outlined pin sits on the middle of its base community, which must be one of its own delivery areas. Pins closer than 44px on screen join into one numbered pin. Pickup pins show the spot each kitchen chose to share, at the precision it chose, and never more.

## Paths

All paths are relative (no leading `/`), so the same files work at the custom domain, at a GitHub Pages project URL, or in a subfolder. The only absolute URLs are the `canonical`, `og:url`, `og:image` and `twitter:image` tags, which point at `https://tiffinfinder.ca/`. `404.html` and `offline.html` each set their own `<base>` from the address at load, so they render correctly at any depth (a mistyped address, or any address opened offline).

## Offline

After the first visit, the service worker (`sw.js`) keeps the app shell on the device. Opening a page that isn't saved while there's no connection shows `offline.html` ("You're offline", with Try again). Both data files (`data/kitchens.json` and `data/dishes.json`) are network-first: the latest copy when online, the last saved copy when not. If there is no saved kitchen list, the page shows a "You're offline" state that retries by itself when the connection comes back; if there is no saved glossary, menus show as plain text. The map files (`data/map/*.json`) are network-first too, but they are not part of the saved app shell: they are downloaded only when someone first opens the map, and saved from then on. Opening the map for the first time with no connection shows a "You're offline" message on the map, with Try again and a button back to the list. The very first visit needs a connection: until the service worker is installed, the browser shows its own offline page.

## Link previews

Pages carry Open Graph and Twitter tags, so links shared on WhatsApp, Facebook, iMessage and similar show a card with `og-image.png` (1200×630, keep it under 300 KB for WhatsApp). The image is rendered from `tools/og.html` with headless Microsoft Edge (Chrome takes the same flags). Run this in Command Prompt from the `tiffinfinder` folder; it uses a throwaway profile folder, not your own:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --user-data-dir="%TEMP%\edge-og" --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=5000 --screenshot="%CD%\og-image.png" "file:///%CD:\=/%/tools/og.html"
```

Edge saves about 370 KB, which is over WhatsApp's 300 KB limit, so the committed file was re-saved losslessly (same pixels, PNG "Sub" row filter) to about 250 KB. Any lossless PNG re-save that gets it under 300 KB works. Kitchen links (`?k=`) share the home page's preview, because link-preview crawlers don't run JavaScript.

## Icons

Icons are generated by `python tools/make_icons.py` (uses Pillow if present, otherwise a built-in pure-Python PNG writer).
