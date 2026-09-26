# LocalBusiness / FoodEstablishment JSON-LD template (draft — not wired in)

**Status: draft only.** Nothing in this file is loaded, generated, or
referenced by any page. It exists so that the day real kitchens go live,
the person shipping that round has an already-thought-through shape to
work from instead of inventing one under time pressure — see
`plans/backlog-3.md` item 13, and `docs/listing-data.md` for the field
names this template reads from.

## The rule this template exists to protect

**Never generate this markup for a sample kitchen (`"sample": true`).**

A visible "Sample" badge protects a *human reader* from mistaking a made-up
kitchen for a real one. It does nothing for a machine reading
`application/ld+json`: a scraper, an aggregator, or a search engine's
structured-data parser reads the JSON, not the badge next to it. Marking up
fictional kitchens with `LocalBusiness`/`FoodEstablishment` schema — a
vocabulary that asserts *a business exists* — would be a stronger, false
claim that the page's own visible honesty doesn't cover. This is why no
schema of this kind ships today, while `data/kitchens.json` holds 24
fictional kitchens (see `plans/backlog-3.md` item 13 and `README.md`
"Structured data").

**Never include a home address**, even for a real kitchen. Tiffin Finder
never shows a home address anywhere on the site (handoff rule 3) —
`pickup.precision` can be `"exact"`, `"intersection"` or `"community"`, and
only what the kitchen agreed to show is ever rendered. The same limit
applies here: this template's `address`/`geo` fields are populated **only**
when `pickup.precision` is `"exact"` and the kitchen's own address is what
it chose to publish (i.e. the same address already rendered on the page as
"Pickup at …" with a "Get directions" link) — never a stored home address
that isn't otherwise shown, and never for `"intersection"` or `"community"`
precision, where there is no address to publish because the kitchen chose
not to share one down to that precision.

## When to wire this in

Only once:

1. At least one kitchen in `data/kitchens.json` has `"sample": false` (or no
   `sample` key), passes the three-field safety gate in
   `docs/listing-data.md` (`permit.checked_on`, `permit.source_url`,
   `consent.listing_ok: true`), and is actually showing on the live site.
2. `tools/check_listings.py` (or a new, equally strict check) is extended to
   refuse to emit this markup for any kitchen that doesn't pass the same
   gate — the code that renders schema must reuse the exact same "is this
   real and consented" check `app.js` already uses to decide whether to
   render the kitchen at all, not a second, looser copy of it.
3. `tools/check_ship.py` gets a companion check to `check_faq_jsonld()`
   (Round 37) that confirms every `LocalBusiness` entry's visible fields
   (name, price range, cuisine) match the kitchen page's own visible text,
   the same "structured data can't say something the page doesn't already
   say" discipline used for the FAQ.

Until then this stays exactly what it is: a draft.

## Field mapping

Source: one kitchen object in `data/kitchens.json`, per
`docs/listing-data.md`.

| JSON-LD field | From | Notes |
|---|---|---|
| `@type` | `business_type` | `"restaurant"` → `FoodEstablishment`; `"caterer"` → `FoodEstablishment` (schema.org has no dedicated Catering type that fits better without overclaiming); `"home_kitchen_permitted"` / `"commissary_cook"` → `FoodEstablishment` (plain — `LocalBusiness` is the fallback type only if `FoodEstablishment` ever feels wrong for a given kitchen). Never `Restaurant` specifically for a home kitchen — that would overclaim what the place is. |
| `name` | `name` | Verbatim, no embellishment. |
| `url` | `https://tiffinfinder.ca/?k=<slug>` | The kitchen's own page on this site, not a claim about the kitchen's own website (it may not have one). |
| `description` | *(omit, or a single factual sentence built from `cuisine` + `business_type` label only)* | Never invent marketing copy; if unsure, omit — schema.org doesn't require it. |
| `servesCuisine` | `cuisine` | One string, as already shown on the card. |
| `priceRange` | `price.day` / `price.weekly` / `price.monthly` | A schema.org `priceRange` is meant to be a rough tier (e.g. `"$"`/`"$$"`), not exact numbers — do **not** stuff a dollar figure in here. Prefer `offers` (below) for exact prices, which is what the field is for. If a tier is wanted at all, derive it the same way the existing max-price filter (Round 44: "Up to $11/$12/$13/$14/$15 per day") already reads `price.day`, so the one number used for filtering is the same one used here — never a second, independently-invented threshold. |
| `offers` | `price.day` / `price.weekly` / `price.monthly` / `trial` | An array of `Offer` objects, one per plan the kitchen actually prices (mirrors the "Plans and prices" table already on the page): `{"@type": "Offer", "name": "Day", "price": 13, "priceCurrency": "CAD"}` and so on. Only plans with a real price (same rule `planPrices()` in `app.js` already uses) get an `Offer` — never a plan the kitchen didn't price. |
| `areaServed` | `delivery.areas` (when `service` includes delivery) | Array of community name strings, verbatim — the same list already shown as delivery chips. Omit entirely for a pickup-only kitchen (no delivery area to claim). |
| `address` | `pickup.label` / `pickup.lat` / `pickup.lon` | **Only** when `pickup.precision === "exact"` — see "the rule this template exists to protect" above. A `PostalAddress` built from whatever the kitchen's own page already shows as its pickup address, never more. Omit entirely for `"intersection"` or `"community"` precision, or when `pickup` is `null` (delivery-only). |
| `geo` | `pickup.lat` / `pickup.lon` | Only under the same `precision === "exact"` condition as `address`, and only when both are non-null numbers (the same condition `app.js` already uses to decide whether to show a "Get directions" link). |
| `telephone` | *(omit)* | The site deliberately keeps a kitchen's number inside the order sheet, not as plain crawlable text (`orderMessage()`/`whatsappDigits()` exist precisely so a number isn't scattered across the page). Don't undo that by publishing it in JSON-LD. |
| `aggregateRating` / `review` | *(never)* | Tiffin Finder collects no reviews or ratings from anyone. Emitting this vocabulary at all — even empty — could be read by a crawler as "reviews exist here"; simply never include these properties. |
| — | `permit` | **Deliberately not mapped to any schema.org property.** There's no schema.org term for "an independent third party checked this business's permit on a date," and inventing one (or misusing `hasCredential` for it) would look like an official certification badge rather than what it actually is. The permit line stays exactly what it is today: plain, human-facing text on the page, not machine-readable claim. |

## Worked (illustrative) shape

Not real data — no kitchen this maps to exists yet. Shown only to make the
mapping above concrete. If this were ever generated, it would sit inside
the same `@graph` array pattern `index.html` already uses (see
`README.md` "Structured data"), one entry per real, live, consented
kitchen, on that kitchen's own page only (never on `index.html`, which
lists many kitchens and isn't any one business).

```json
{
  "@context": "https://schema.org",
  "@type": "FoodEstablishment",
  "name": "<kitchen's own name>",
  "url": "https://tiffinfinder.ca/?k=<slug>",
  "servesCuisine": "Punjabi",
  "areaServed": ["Saddle Ridge", "Martindale"],
  "offers": [
    { "@type": "Offer", "name": "Day", "price": 13, "priceCurrency": "CAD" },
    { "@type": "Offer", "name": "Week", "price": 75, "priceCurrency": "CAD" },
    { "@type": "Offer", "name": "Month", "price": 260, "priceCurrency": "CAD" }
  ]
}
```

(No `address`/`geo` in this example because it illustrates a
delivery-and-pickup kitchen with `pickup.precision: "community"` — the
common case per `docs/listing-data.md`'s own note that most kitchens choose
neighbourhood-only precision, not an exact address.)

## Sources

- `docs/listing-data.md` (field names, the safety gate, the honesty rules
  already enforced by `app.js` and `tools/check_listings.py`)
- `TIFFIN-FINDER-HANDOFF.md`, rule 3 (pickup precision, never a home
  address) and rule 2 (no "verified"/"approved" wording)
- schema.org: [`FoodEstablishment`](https://schema.org/FoodEstablishment),
  [`Offer`](https://schema.org/Offer),
  [`PostalAddress`](https://schema.org/PostalAddress) — vocabulary
  reference only; nothing here was fetched or verified against Google's
  current rich-result eligibility rules, since none of this is shipping
  yet (re-check Google's Search Central docs for `LocalBusiness` rich
  results before wiring this in, the same way `plans/backlog-3.md` item 14
  was checked for `FAQPage` before that shipped).
