# Changelog

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
