# Map data

The map view (`./?view=map`) is drawn from two files in this repository. Nothing is fetched from a map service: no tiles, no map library, no API key. The browser downloads these two files the first time someone opens the map, and the service worker keeps a copy after that.

All sources below were accessed on **23 September 2026**.

## The two files

| File | What it holds |
|---|---|
| `data/map/calgary.json` | All 313 City of Calgary community districts: 223 residential communities, 43 industrial areas, 4 major parks and 43 unnamed "residual" sub-areas (`cls` is `residential`, `industrial`, `park` or `residual`). About 112 KB. |
| `data/map/airdrie.json` | Airdrie's 56 neighbourhoods plus the city boundary outline (`meta.city_boundary_path`). Airdrie also uses `rural_residential` (country-residential estates) and `annexation` (large undeveloped annexed land, with no quadrant). About 19 KB. |

Each file has a `meta` block (source, licence, projection and notes) and a `communities` list. Every community has:

- `name` and `slug` (the slug is the address-style name, such as `saddle-ridge`),
- `quadrant` (NE, NW, SE or SW),
- `cls` (the kind of area, above),
- `path`, a ready-to-draw SVG path (`M x y L x y … Z`, coordinates rounded to 0.1),
- `label`, the point where a pin or name goes.

The files are copied here exactly as built. Don't edit them by hand.

## Sources

- **Calgary community shapes:** The City of Calgary, *Community District Boundaries* (Open Calgary dataset `surr-xmvs`). <https://data.calgary.ca/Base-Maps/Community-District-Boundaries/surr-xmvs>
- **Calgary quadrants:** The City of Calgary, *Parcel Address* (Open Calgary dataset `9zvu-p8uz`), field `street_quad`. Each community's quadrant is the street quadrant most of its official address points use. <https://data.calgary.ca/resource/9zvu-p8uz>
- **Airdrie neighbourhood shapes:** City of Airdrie Open Data, *Airdrie Neighbourhoods*. <https://data-airdrie.opendata.arcgis.com/datasets/7416b6187a03422a9c76d3fbecef5548>
- **Airdrie quadrants and outline:** City of Airdrie Open Data, *Airdrie Quadrant Boundary* and *Airdrie Boundary*. <https://data-airdrie.opendata.arcgis.com/>

## Licences and the credit lines

- Calgary data: *Open Government Licence – City of Calgary* (version 2.1). <https://data.calgary.ca/stories/s/u45n-7awa>
- Airdrie data: *Open Data Licence – City of Airdrie* (version 1.0). <https://data-airdrie.opendata.arcgis.com/pages/our-open-licence>

Both licences require a credit line wherever the map is shown. These two sentences sit under the map, each linking to its licence, and must stay word for word:

> Contains information licensed under the Open Government Licence – City of Calgary.
>
> Contains information licensed under the Open Data Licence – City of Airdrie.

Using the data under these licences does not mean either City endorses Tiffin Finder, and nothing on the site should suggest that it does. Don't use either City's logo anywhere on the site.

## How the map is drawn

- **Simplified shapes.** The boundaries were simplified for an illustrated map (a Douglas-Peucker simplification that keeps shared borders shared, tolerance about 30 m). They are close, but they are not survey-accurate and must not be used to decide which community an address is in.
- **Label points.** Each `label` is the "pole of inaccessibility": the point inside the shape that is furthest from its edges, so a pin there sits well inside the community.
- **Keys are city plus slug.** Bayview and Sunridge exist in both Calgary and Airdrie, so the app always matches on city and slug together (`calgary:sunridge`, `airdrie:sunridge`), never on the name alone.
- **Airdrie's position.** Airdrie is drawn at the same scale as Calgary, directly north, in its own panel. To keep the map compact it is moved about 1.2 km closer to Calgary than its true position (the real offset in the file is `origin_in_calgary_frame` = [496.8, -397.8]; the app uses [497, -360]).
- **Blank areas are correct.** Glenmore Reservoir and a few river strips are not part of any community, so they show as gaps.

## How kitchens get a pin

The map is built around pickup, because most home tiffin kitchens don't deliver. Each kitchen in `data/kitchens.json` has a `base_community`, for example `{"city": "calgary", "slug": "redstone"}`, which must be a community in the matching map file (Airdrie kitchens use `airdrie`), and an `area` with the same slug.

- **Pickup pins.** A kitchen that offers pickup (`"service": "pickup"` or `"both"`) gets its own saffron pin at `pickup.point`. The point is in the city file's own coordinates (`calgary.json` for Calgary, the raw `airdrie.json` frame for Airdrie; the app adds the Airdrie offset, the same way it does for label points). It must fall inside the base community's shape, or the kitchen is left off the map and counted in the note under it ("N matching kitchens aren't on the map yet"); the list still shows it. The pin shows the spot the kitchen chose to share, at the precision it chose (exact address, nearest intersection or neighbourhood only), and never more. The sample kitchens use made-up points inside their neighbourhood, placed by `python tools/sample_pickup.py`, with no street locations.
- **Delivery-only pins.** A kitchen that only delivers has no spot to show. Its base community must be one of its own delivery areas, and it joins an outlined pin on that community's label point, shared with any other delivery-only kitchens based there.
- **Count badges.** When two pins would sit closer than 44px on screen, they join into one numbered pin (at the average of their positions), worked out again after every filter, zoom and window resize. Tapping it opens one preview listing every kitchen in it. Zooming in to a quadrant spreads pins further apart.
- **Delivery shading.** Opening, pointing at or focusing a pin lightly shades the communities its kitchens deliver to. Pickup-only kitchens shade nothing.

Airdrie's open data spells one neighbourhood "Kings Heights". The kitchen data follows the City's planning pages and writes "King's Heights". Both become the slug `kings-heights`, so they match without renaming anything (see `docs/research-notes.md`).

## Refreshing the data

The script that built these files is not in this repository (it was written for a one-off build on another machine and refers to a local folder). To refresh the map when the City boundaries change:

1. Download the four datasets above again from the City portals.
2. Project them with the same equirectangular projection (the formula is in each file's `meta.projection`), simplify them the same way, and write them in the same JSON shape, with the same `slug`, `quadrant`, `cls`, `path` and `label` fields.
3. Check that every kitchen's `base_community` still exists in the new files, with the same quadrant.
4. Bump `VERSION` in `sw.js`, as for any change to the site's files.
