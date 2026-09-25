# Listing data model

What one kitchen looks like in `data/kitchens.json`, field by field, for the
day real kitchens are added (handoff §8 step 3). This documents the shape
the app already reads and writes; it doesn't rename anything that already
exists, only adds the fields real listings need that the sample data didn't.

Every permitted tiffin option is listed — a home kitchen with a permit, a
restaurant, a caterer, or a cook renting a commissary (rented commercial)
kitchen — not home kitchens only (Adeel's decision, 25 Sep 2026). Pickup and
delivery are shown equally; the list is the default view, the map is
secondary.

## The safety gate (read this first)

A kitchen with `"sample": true` always shows: that's the sample data, and it
never carries any of the rules below.

A **real** kitchen (`"sample": false`, or the key left out) is skipped —
not shown anywhere on the site — unless **all three** of these are present:

- `permit.checked_on` — a real `YYYY-MM-DD` date, not in the future
- `permit.source_url` — an `https://` link
- `consent.listing_ok` — exactly `true`

`app.js` checks this itself every time it loads `data/kitchens.json` (it
prints a `console.warn` naming the kitchen and skips it, rather than showing
a half-checked listing). `tools/check_listings.py` checks the same three
fields, plus everything else on this page, before a commit ships — run it
with `python tools/check_ship.py`, which calls it automatically.

## Field-by-field

### Identity and type

- `slug` — the URL-safe id (`?k=<slug>`). Lowercase, hyphens, must be unique.
- `name` — the kitchen's own name.
- `sample` — `true` for made-up sample kitchens, `false` (or omitted) for a
  real one.
- `business_type` — one of:
  - `"home_kitchen_permitted"` — a home kitchen with an AHS Food Handling
    Permit for its home.
  - `"restaurant"` — a licensed restaurant kitchen.
  - `"caterer"` — a licensed catering business.
  - `"commissary_cook"` — a cook who rents time in a licensed commercial
    (commissary) kitchen.

  Shown as a small neutral label on the card and the kitchen page ("Home
  kitchen · permitted", "Restaurant", "Caterer", "Rented commercial
  kitchen") and as the "Type" filter (`?type=`). It is never a claim about
  food quality — only what kind of place it is. An unknown or missing value
  shows no label and matches no type filter, but the kitchen still lists
  (like every other optional field on this page).

### Service, pickup and delivery (already used — extend, don't rename)

- `service` — `"pickup"`, `"delivery"` or `"both"`. `app.js` doesn't trust
  this blindly: it falls back to whatever the data actually backs (a valid
  `pickup`, or at least one delivery area), so get `pickup` and `delivery`
  right and `service` mostly takes care of itself.
- `area` — the kitchen's own community name, as it spells it.
- `base_community` — `{"city": "calgary" | "airdrie", "slug": "<community>"}`.
  The slug of `area` must equal `base_community.slug`, and the community
  must exist in `data/map/calgary.json` or `data/map/airdrie.json`
  (an Airdrie kitchen — quadrant `Airdrie` — uses `"city": "airdrie"`).
- `pickup` — `null` for a delivery-only kitchen, or:
  ```json
  {
    "precision": "exact" | "intersection" | "community",
    "label": "Saddletowne Circle NE",
    "point": [794.9, 271.8],
    "lat": 51.1234,
    "lon": -113.9876,
    "notes": "Pickup Monday to Friday by arrangement."
  }
  ```
  - `precision` is how the kitchen chose to share its spot: its address
    (`exact`), the nearest intersection (`intersection`), or its
    neighbourhood only (`community`). **Never put a street address in
    `label` when `precision` is `"community"`** — the label is shown as
    fine print, and a street address there defeats the point of choosing
    neighbourhood-only.
  - `point` is `[x, y]` in the city map file's own coordinate frame (see
    `data/map/calgary.json` / `airdrie.json`), and must fall inside the
    kitchen's `base_community`.
  - `lat`/`lon` are only used for the "Get directions" link, and only show
    one when `precision` is `exact` or `intersection`. Leave them `null`
    for a `community`-precision spot — never show a home address.
- `delivery` — `{"areas": ["Saddle Ridge", "Martindale", ...], "notes": "..."}`.
  `areas` are community names (matched the same way as `area` above); a
  pickup-only kitchen has `"areas": []` and `"notes": ""`.

### Plans and prices (already used as `price`, `trial` — extend, don't rename)

- `price` — `{"day": 13, "weekly": 75, "monthly": 260}`. Any of the three
  may be absent (or `null`) — a kitchen only lists the plans it actually
  offers, and the card and kitchen page only show the ones that are there.
- `trial` — `{"offered": true, "price": 64, "note": null}` or `null`. A
  trial week; `price` may be `null` ("Ask the kitchen"), `note` is an
  optional 1–120 character line.
- `taking_new_customers` is the `capacity` field: `"open" | "waitlist" | "full"`.

### Permit (already used — extend with `holder_name_matches`)

```json
"permit": {
  "status": "verified",
  "checked_on": "2026-11-03",
  "expires": "2027-11-03",
  "source_url": "https://inspectionsonline.chr.alberta.ca/...",
  "method": "AHS public inspection record, facility name and address matched.",
  "holder_name_matches": true
}
```

- `checked_on` — the day we checked it (`YYYY-MM-DD`). Required for a real
  kitchen to show (see "The safety gate" above).
- `expires` — the permit's expiry date, if known. Once it's passed, the
  kitchen shows "Permit being re-checked" and ordering pauses.
- `source_url` — the public record link, `https://` only. For a home
  kitchen or restaurant this is normally the page for that facility in the
  AHS public inspection database (`inspectionsonline.chr.alberta.ca`); use
  whatever public record actually names the permit holder and address.
  Required for a real kitchen to show.
- `holder_name_matches` — `true` once you've checked that the name on the
  permit record matches the person or business you're listing. Internal:
  `tools/check_listings.py` requires it to be `true`; the site never shows
  it. If it's ever `false`, don't list the kitchen — the permit doesn't
  clearly belong to who you think it does.
- `method` (optional, ≤120 characters) — a short note on how it was
  checked, shown as "How we checked: …".
- The kitchen page always keeps the existing one-date wording: "Permit
  status checked on `<date>`." plus the source link plus "Not a
  food-safety inspection or endorsement." — this document doesn't change
  that wording.

### Consent (new, internal — never displayed)

```json
"consent": {
  "written_on": "2026-11-01",
  "listing_ok": true
}
```

- `written_on` — the day the kitchen gave written consent to be listed
  (a text, email or signed form — keep the original off this repo; this is
  just the date).
- `listing_ok` — must be exactly `true`. Required for a real kitchen to
  show (see "The safety gate" above). This object is never rendered
  anywhere on the site; it exists only so `app.js` and
  `tools/check_listings.py` can enforce that nothing goes live without
  consent.

### Contact (already used — extend, don't rename)

- `contact` — `{"whatsapp": "14035551234", "phone": "403-555-1234"}`. At
  least one of the two is required for a real kitchen (`check_listings.py`
  checks this); the phone number is never shown as the site's own contact
  number (rule 10 of the handoff), only the kitchen's.

## Full annotated example (a real, permit-checked home kitchen)

```json
{
  "slug": "example-home-tiffin",
  "name": "Example Home Tiffin",
  "sample": false,
  "business_type": "home_kitchen_permitted",
  "hue": 28,
  "cuisine": "Punjabi",
  "quadrant": "NE",
  "area": "Saddle Ridge",
  "base_community": { "city": "calgary", "slug": "saddle-ridge" },
  "service": "both",
  "pickup": {
    "precision": "community",
    "label": "Saddle Ridge",
    "point": [794.9, 271.8],
    "lat": null,
    "lon": null,
    "notes": "Pickup Monday to Friday, ask for the exact spot when you order."
  },
  "veg_only": false,
  "halal": false,
  "jain": false,
  "description": "Home-style Punjabi tiffins, five days a week.",
  "price": { "day": 13, "weekly": 75, "monthly": 260 },
  "trial": { "offered": true, "price": 64, "note": null },
  "capacity": "open",
  "menu": {
    "week_of": "2026-11-02",
    "items": [
      { "day": "Mon", "dish": "Rajma, jeera rice, 4 rotis, kachumber salad", "price": 13 }
    ]
  },
  "contact": { "whatsapp": "14035551234", "phone": "403-555-1234" },
  "delivery": {
    "areas": ["Saddle Ridge", "Martindale"],
    "notes": "Delivery Monday to Friday between 11:30 and 1:00."
  },
  "permit": {
    "status": "verified",
    "checked_on": "2026-11-01",
    "expires": "2027-11-01",
    "source_url": "https://inspectionsonline.chr.alberta.ca/facility/example",
    "method": "AHS public inspection record, facility name and address matched.",
    "holder_name_matches": true
  },
  "consent": {
    "written_on": "2026-10-30",
    "listing_ok": true
  },
  "last_posted": "2026-11-01T18:00:00-06:00"
}
```

## Checking a listing

Run `python tools/check_listings.py` (also run automatically by
`python tools/check_ship.py`). It checks every real kitchen (`sample` not
`true`) in `data/kitchens.json` for:

- every field above that's required is present and the right type
- `checked_on`, `expires`, `written_on` are real `YYYY-MM-DD` dates, and
  `expires` (if present) is after `checked_on`
- `business_type` and `service` are one of the known values
- `area` / `base_community.slug` / every `delivery.areas` entry names a
  community that actually exists in `data/map/calgary.json` or
  `data/map/airdrie.json`
- `pickup.label` holds no street-address-shaped text when
  `pickup.precision` is `"community"`
- at least one of `contact.whatsapp` / `contact.phone` is present
- none of the banned phrases ("AHS approved", "verified by", "Permit
  verified") appear anywhere in the file

It prints one line per problem, naming the kitchen, and exits non-zero if
anything fails — nothing is written back to the file.
