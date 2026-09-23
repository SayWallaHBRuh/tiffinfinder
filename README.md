# Tiffin Finder

Tiffin Finder is a Calgary directory of permit-verified home tiffin kitchens: households browse by quadrant, cuisine and price, open a kitchen to see this week's menu, follow it, and order by WhatsApp or phone directly with the kitchen. This is phase one: a read-only static PWA (no accounts, ordering, payments or delivery) built with plain HTML, CSS and JavaScript, and **`data/kitchens.json` is sample data** — fictional kitchens with 403-555-01xx numbers, labelled "Sample" on every card; real kitchens are added only after permit verification and with their permission.

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

## Addresses the app understands

The home page (`./`) reads these from the address:

- `?k=<slug>` opens a kitchen, for example `./?k=saffron-lane-rasoi`.
- `?view=following` shows the kitchens you follow.
- Otherwise it shows the list, with any filters: `?q=<search>&area=NE|NW|SE|SW|Airdrie&near=<community>&cuisine=<name>&price=low|mid|high&veg=1&halal=1&jain=1`. Filters left at their default are left out, so the plain list is just `./`. Changing a filter updates the address in place (no extra Back steps), so a filtered list can be reloaded or shared.
- `near=<community>` shows the kitchens that deliver to that community, for example `./?near=saddle-ridge`, with a "Delivers to Saddle Ridge" pill above the list that removes it. The community is written in lowercase letters and numbers, with apostrophes removed and any other characters, such as spaces, turned into a single hyphen ("King's Heights" becomes `kings-heights`, "McKenzie Towne" becomes `mckenzie-towne`). A community no kitchen delivers to is ignored. The delivery areas on each kitchen's page and the "Browse by neighbourhood" section on the home page link to it.
- Search also matches delivery communities, ignoring case, apostrophes and hyphens, so `saddle-ridge` and `kings heights` both work.

## Data

- `data/kitchens.json` is **sample data**: fictional kitchens with 403-555-01xx numbers, labelled "Sample" on every card.
- `data/dishes.json` is the dish glossary shown on kitchen pages: a dish name on a menu that matches one of an entry's `terms` gets a dotted underline and opens that entry's one-line description. If the file can't load, menus show as plain text.
- `docs/research-notes.md` lists the sources for community names, quadrants and dish descriptions. Delivery communities must come from the lists named there, with each community in one quadrant only.

## Paths

All paths are relative (no leading `/`), so the same files work at the custom domain, at a GitHub Pages project URL, or in a subfolder. The only absolute URLs are the `canonical`, `og:url`, `og:image` and `twitter:image` tags, which point at `https://tiffinfinder.ca/`. `404.html` and `offline.html` each set their own `<base>` from the address at load, so they render correctly at any depth (a mistyped address, or any address opened offline).

## Offline

After the first visit, the service worker (`sw.js`) keeps the app shell on the device. Opening a page that isn't saved while there's no connection shows `offline.html` ("You're offline", with Try again). Both data files (`data/kitchens.json` and `data/dishes.json`) are network-first: the latest copy when online, the last saved copy when not. If there is no saved kitchen list, the page shows a "You're offline" state that retries by itself when the connection comes back; if there is no saved glossary, menus show as plain text. The very first visit needs a connection: until the service worker is installed, the browser shows its own offline page.

## Link previews

Pages carry Open Graph and Twitter tags, so links shared on WhatsApp, Facebook, iMessage and similar show a card with `og-image.png` (1200×630, keep it under 300 KB for WhatsApp). The image is rendered from `tools/og.html` with headless Microsoft Edge (Chrome takes the same flags). Run this in Command Prompt from the `tiffinfinder` folder; it uses a throwaway profile folder, not your own:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --user-data-dir="%TEMP%\edge-og" --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=5000 --screenshot="%CD%\og-image.png" "file:///%CD:\=/%/tools/og.html"
```

Edge saves about 370 KB, which is over WhatsApp's 300 KB limit, so the committed file was re-saved losslessly (same pixels, PNG "Sub" row filter) to about 250 KB. Any lossless PNG re-save that gets it under 300 KB works. Kitchen links (`?k=`) share the home page's preview, because link-preview crawlers don't run JavaScript.

## Icons

Icons are generated by `python tools/make_icons.py` (uses Pillow if present, otherwise a built-in pure-Python PNG writer).
