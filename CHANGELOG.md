# Changelog

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
