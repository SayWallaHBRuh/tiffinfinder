# Research notes

Where the facts behind Tiffin Finder's sample data come from. The kitchens themselves are made up. The places and dish descriptions are real, and this page says where each one was checked.

All sources below were accessed on **23 September 2026**.

## Calgary communities and quadrants

Every Calgary community in `data/kitchens.json` is an official City of Calgary community, and each is filed under the quadrant its street addresses use.

- **Official community names:** City of Calgary Open Data, *Community District Boundaries* (dataset `surr-xmvs`).
  - Page: <https://data.calgary.ca/Base-Maps/Community-District-Boundaries/surr-xmvs>
  - Data used: <https://data.calgary.ca/resource/surr-xmvs.json> (fields `name`, `class`, `sector`). Only communities with `class` = `Residential` are used.
- **Quadrant (NE / NW / SE / SW):** the boundaries dataset gives a planning *sector* (such as NORTH or CENTRE), not an address quadrant. So each community's quadrant comes from the City's address-level dataset *Waste and Recycling Collection Schedule* (dataset `jq4t-b745`), which lists `community` and `quadrant` for every serviced address. The addresses were grouped by community and quadrant.
  - Page: <https://data.calgary.ca/Services-and-Amenities/Waste-and-Recycling-Collection-Schedule/jq4t-b745>
  - Query used: `https://data.calgary.ca/resource/jq4t-b745.json?$select=community,quadrant,count(*)&$group=community,quadrant`
- **Rule:** only communities where every address falls in a single quadrant are used. Communities that straddle two quadrants (for example Abbeydale, Beddington Heights, Crescent Heights, Highland Park, Huntington Hills, Livingston, Thorncliffe, Tuxedo Park) are left out so that no filter shows a kitchen in the wrong quadrant.

### Corrections made to the round 1–2 sample data

- **Savanna** is not in the City's community list (it is a development name, not an official community). *Shorshe Bari Bhoj* now delivers to Saddle Ridge instead.
- **Coventry Hills** and **Harvest Hills** use NE addresses, not NW. *Sarson Rasoi* (NW) now delivers to Hidden Valley and Hamptons instead. Both communities are now served by an NE sample kitchen.

## Airdrie communities

Airdrie names come from the City of Airdrie's own planning pages:

- *Southeast CASP*: "the communities of: King's Heights, Ravenswood and Lanark". <https://www.airdrie.ca/index.cfm?serviceID=2253>
- *West Airdrie CASP*: "Sagewood, Canals, Bayside, Bayview and Baysprings". <https://www.airdrie.ca/index.cfm?serviceID=2256>
- *Neighbourhood structure plans* (lists Coopers Crossing, Hillcrest, Midtown, Reunion, Williamstown and others). <https://www.airdrie.ca/index.cfm?serviceID=1999>

The City spells it **King's Heights**, with an apostrophe. The earlier sample data had "Kings Heights".

## Map pins (base community)

Each sample kitchen has a `base_community` (city + slug) that places its pin on the map. For delivery kitchens it is one of that kitchen's own delivery communities. Pickup kitchens also have a `pickup` object; sample pickup spots are made-up points inside the base community, with no street text (see `tools/sample_pickup.py`). The communities were chosen so that pins don't overlap on a phone-sized map (at least about 42 px apart at 328 px wide) and so that several kitchens share a pin in the busiest areas. The map shapes and their sources are described in `docs/map-data.md`.

Airdrie's open-data neighbourhood layer spells the name **"Kings Heights"**, without the apostrophe. Pins are matched by slug (`kings-heights`), which is the same for both spellings, so the City planning-page spelling **"King's Heights"** stays in the kitchen data.

## Dish glossary (`data/dishes.json`)

Each description is a short paraphrase written for Tiffin Finder and checked against the source in that entry's `source` field. Wikipedia is used as a reference that anyone can open. Where a dish has no article of its own, the entry cites the cuisine article that names and describes it.

Articles each opened and checked:

- Cuisine articles: Punjabi, Pakistani, Gujarati, Hyderabadi, Bengali, Bangladeshi, Afghan, Nepalese, Sri Lankan and Filipino cuisine; Cuisine of Kerala; List of Indian dishes; Dal.
- Dish articles: Jeera rice (now titled "Jeera bhaat"), Kachumber, Aloo gobi, Aloo mattar ("Aloo mutter"), Chaas, Dal dhokli, Handvo, Chutney, Papadam, Aloo gosht, Korma, Mirchi ka salan, Dalcha, Double ka meetha, Lemon rice ("Chitranna"), Puliyodarai ("Pulihora"), Medu vada, Pongal (dish), Rosematta rice ("Matta rice"), Chettinad cuisine, Machher jhol, Shukto, Kosha mangsho (redirects to "Mutton curry", which names kosha mangsho), Borhani, Aloo tama, Kiri hodi, Atchara, Pancit.

Dishes dropped from the sample menus because no reliable source could be confirmed: paneer bhurji, tinda masala, lauki kofta, bhindi masala, vangi bath, daal mash, aloo bhujia, bhindi gosht, begun bhaja, aloo bhaja, aloo posto, cholar dal, bhetki paturi, dim kosha, ambul thiyal, wambatu moju, egg roast, moru curry. They were swapped for dishes that do have a source. The menus are fictional, so nothing real changed.

Checking method: Wikipedia refused direct automated requests from the build machine (HTTP 403), so each article was opened one at a time through a web reader and its opening description compared with the glossary line.

## Dish glossary audit (overnight round 2)

25 glossary entries were picked as the most likely to be vague, oversimplified, or otherwise worth re-checking, and each was compared against a reputable source. All checked **24 September 2026**.

### Corrected

- **Bhuna khichuri** (`khichuri`) — the description said "bhuna means fried until rich, here with beef", but khichuri/khichdi is a generic rice-and-lentil dish that is very often vegetarian; naming a specific protein inside a general glossary definition was misleading. Multiple sources describe bhuna khichuri's defining trait as its drier, pilaf-like texture from the "bhuna" (fried) step, not a required meat. Reworded to describe the texture instead of a protein. Sources: [Bhuna Khichuri, WithASpin](https://withaspin.com/2014/07/20/rainy-day-bhuna-khichuri/), [Bhuni khichuri, Rumki's Golden Spoon](https://rumkisgoldenspoon.com/bhuni-khichuri/) (accessed 2026-09-24).

### Confirmed accurate, left as-is

- **Shaak** — "the Gujarati word for a cooked vegetable dish" matches multiple Gujarati-cooking sources describing shaak/sabzi as the general term for cooked vegetable dishes. Source: [Gujarati Shaak Sabzi Recipes, Tarla Dalal](https://www.tarladalal.com/recipes-for-gujarati-shaak-sabzi-27) (accessed 2026-09-24).
- **Dudhi** — "bottle gourd, a mild green vegetable" matches its use as an ingredient across Gujarati recipe sources. Source: [Dudhi (lauki, bottle gourd), Indiaphile](https://indiaphile.info/ingredients/dudhi-lauki-bottle-gourd/) (accessed 2026-09-24).
- **Chettinad** — "a Tamil regional style known for bold, peppery spice blends" matches Wikipedia's description of a Nagarathar-community regional style built on freshly ground pepper, fennel, star anise and other spices. Source: [Chettinad cuisine, Wikipedia](https://en.wikipedia.org/wiki/Chettinad_cuisine) (accessed 2026-09-24).
- **Khaman dhokla** (`dhokla`) — "a soft, spongy, steamed savoury cake from Gujarat" is accurate and general enough to cover both the khaman and dhokla families, which recipe sources treat as closely related steamed Gujarati cakes often sold under a combined name. Source: [Khaman vs Dhokla, Gulf Times](https://www.gulf-times.com/story/617645/Khaman-vs-dhokla-the-Gujarati-cuisine) (accessed 2026-09-24).
- **Korma** — "meat or vegetables braised slowly with yogurt and spices into a thick sauce" matches Wikipedia's description of the Mughal-era braising technique. Source: [Korma, Wikipedia](https://en.wikipedia.org/wiki/Korma) (accessed 2026-09-24).
- **Borhani** — "a spiced yogurt drink from Bangladesh, served with rich rice dishes" matches its description as a yogurt-based drink served alongside biryani and other rich dishes. Source: [Borhani, Wikipedia](https://en.wikipedia.org/wiki/Borhani) (accessed 2026-09-24).
- **Bagara rice** — "Hyderabadi rice cooked with whole spices; bagara khana, often served with dalcha" matches Wikipedia's bagara khana article. Source: [Bagara khana, Wikipedia](https://en.wikipedia.org/wiki/Bagara_khana) (accessed 2026-09-24).
- **Tamarind rice** — "rice mixed with a tangy tamarind, spice and peanut paste; puliyodarai in Tamil" matches the pulihora/puliyodarai preparation, which includes peanuts among the tempered seasonings mixed into the tamarind base. Source: [Pulihora, Wikipedia](https://en.wikipedia.org/wiki/Pulihora) (accessed 2026-09-24).
- **Yellow rice** — "rice cooked with turmeric and spices; kaha bath in Sinhala" matches Wikipedia's Yellow rice article, which names kaha buth as the Sri Lankan form without asserting further ingredient specifics; kept general rather than adding an unconfirmed detail. Source: [Yellow rice, Wikipedia](https://en.wikipedia.org/wiki/Yellow_rice) (accessed 2026-09-24).
- **Khatti dal** — "Hyderabadi sour dal, soured with tamarind and eaten with rice and pickle" matches recipe and reference sources on Hyderabadi khatti dal. Source: [Khatti Dal, Wikipedia](https://en.wikipedia.org/wiki/Khatti_Dal) (accessed 2026-09-24).
- **Kadhi** — "a tangy curry of yogurt or buttermilk thickened with gram flour" matches the general description of kadhi/karhi across regional sources. Source: [Kadhi, Wikipedia](https://en.wikipedia.org/wiki/Kadhi) (accessed 2026-09-24).
- **Kadhi pakora** — "a tangy yogurt and gram-flour curry with soft gram-flour fritters (pakoras) in it" matches the Punjabi kadhi pakora preparation, distinct from the plainer Gujarati kadhi entry. Source: [Punjabi Kadhi Pakora, Cook With Manali](https://www.cookwithmanali.com/punjabi-kadhi-pakora/) (accessed 2026-09-24).
- **Sev tameta shaak** — "a tomato curry topped with crunchy gram-flour noodles (sev)" matches sev tameta nu shaak recipe sources. Source: [Sev Tamatar Ki Sabji, Dassana's Veg Recipes](https://www.vegrecipesofindia.com/sev-tameta-nu-shaak-recipe/) (accessed 2026-09-24).
- **Challow** — "Afghan white rice cooked with mild spices so the grains stay separate" matches Wikipedia's challow article. Source: [Challow, Wikipedia](https://en.wikipedia.org/wiki/Challow) (accessed 2026-09-24).
- **Shorwa** — "a simple Afghan soup of meat and vegetables" matches multiple sources describing shorwa as a meat-and-vegetable Afghan soup/stew. Source: [Shorwa- The Afghan Soup, Afghan Cooks](https://afghancooks.com/shorwa-the-afghan-soup/) (accessed 2026-09-24).
- **Achar** — "a South Asian pickle of fruit or vegetables preserved with spices, oil or salt" matches Wikipedia's South Asian pickle article. Source: [South Asian pickle, Wikipedia](https://en.wikipedia.org/wiki/South_Asian_pickle) (accessed 2026-09-24).
- **Pol sambol** — "freshly grated coconut ground with chilli, onion and lime" matches Wikipedia's pol sambol article. Source: [Pol sambol, Wikipedia](https://en.wikipedia.org/wiki/Pol_sambol) (accessed 2026-09-24).
- **Kiri hodi** — "a mild, fragrant Sri Lankan coconut-milk gravy" matches Wikipedia's kiri hodi article. Source: [Kiri hodi, Wikipedia](https://en.wikipedia.org/wiki/Kiri_hodi) (accessed 2026-09-24).
- **Ishtu** — "a mild Kerala stew of vegetables or meat in coconut milk, often eaten with appam" matches sources on Kerala appam-and-ishtu. Source: [Appam and Ishtu, My Diverse Kitchen](https://www.mydiversekitchen.com/appam-and-ishtu) (accessed 2026-09-24).
- **Rezala** — "meat in a thin, fragrant gravy of yogurt and cardamom" matches the Wikipedia Rezala article's own wording almost exactly ("meat in a thin yogurt and cardamom gravy"). Source: [Rezala, Wikipedia](https://en.wikipedia.org/wiki/Rezala) (accessed 2026-09-24).
- **Polao** — "fragrant rice cooked with ghee and whole spices, the Bengali pilaf" matches Bengali polao recipe sources describing ghee and whole-spice preparation. Source: [Basanti Pulao, Whiskaffair](https://www.whiskaffair.com/bengali-mishti-pulao-bengali-sweet-pulao/) (accessed 2026-09-24).
- **Shak bhaji** — "leafy greens (shak) stir-fried with garlic and chilli" matches Bangladeshi shak bhaji preparation sources. Source: [Leafy Greens (Shak Bhaji), Vegan Bangla](https://veganbangla.com/category/vegan-bangla/traditional/leafy-greens-shak-bhaji-%E0%A6%B6%E0%A6%BE%E0%A6%95-%E0%A6%AD%E0%A6%BE%E0%A6%9C%E0%A6%BF/) (accessed 2026-09-24).
- **Bhorta** — "mashed vegetables, such as potato or roasted aubergine, mixed with mustard oil and chilli" matches Bangladeshi bhorta sources. Source: [Aloo Bhorta, Bong Eats](https://www.bongeats.com/recipe/aloo-bhorta/) (accessed 2026-09-24).
- **Haleem** — "a slow-cooked stew of meat, wheat and lentils, stirred until thick and smooth" matches the Hyderabadi haleem preparation (the entry is sourced to the Hyderabadi cuisine article, and Hyderabadi haleem specifically includes lentils, unlike the plainer Middle Eastern harees it descends from). Source: [Haleem, Wikipedia](https://en.wikipedia.org/wiki/Haleem) (accessed 2026-09-24).

## Sample kitchen name check (overnight round 2)

The first 10 sample kitchens in `data/kitchens.json` (array order) were each checked against currently-operating Calgary/Airdrie food businesses by searching `"<name>" Calgary` (or Airdrie for the Airdrie kitchen). No real-business name clash was found for any of them, so no renames were made. Checked **24 September 2026**:

- **Saffron Lane Rasoi** — searched "Saffron Lane Rasoi" Calgary; found separate, differently-named Calgary restaurants "Saffron" and "Rasoi East Indian & Hakka Chinese Cuisine", but no business matching the full sample name.
- **Kesar Thali Ghar** — searched "Kesar Thali Ghar" Calgary; found only "Kesar's - An Indian Thali" in New Jersey (no Calgary presence) and generic Calgary thali-restaurant listings, no matching real business.
- **Dastarkhwan Dabba** — searched "Dastarkhwan Dabba" Calgary; found a "Dastarkhwan" restaurant in Mississauga (closed) and unrelated Dastarkhwan-named businesses elsewhere, none in Calgary and none matching the full name.
- **Idli Avenue Tiffins** — searched "Idli Avenue Tiffins" Calgary; found generic Calgary tiffin-service listings and a "Tiffin Curry & Roti House", no matching real business.
- **Shorshe Bari Bhoj** — searched "Shorshe Bari Bhoj" Calgary; found only generic Bengali-restaurant-naming pages and unrelated "Shorshe"/"Bhoj"-named venues elsewhere, no matching real business.
- **Nolan Hill Dosa Dabba** — searched "Nolan Hill Dosa Dabba" Calgary; found "Dosa Garden" in nearby Sage Hill and other Indian restaurants near Nolan Hill, but no business matching the sample name.
- **Sarson Rasoi** — searched "Sarson Rasoi" Calgary; found only the unrelated "Rasoi East Indian & Hakka Chinese Cuisine" (different name) and the UK brand "Sarson's" (a vinegar brand, unrelated), no matching real business.
- **Pamir Dastarkhan Home Kitchen** — searched "Pamir Dastarkhan" Calgary; found unrelated Calgary businesses named "Pamir" (a fashion boutique and a roofing company), no food business by this name.
- **Ahimsa Jain Bhojan** — searched "Ahimsa Jain Bhojan" Calgary; found Jain community and vegetarian-restaurant references in Calgary but no business using this name.
- **Airdrie Biryani Ghar** — searched "Airdrie Biryani Ghar" Airdrie; found several other-named Indian restaurants in Airdrie (Amritsari Tadka, Golden Cinnamon, Qasid Tandoori, Paprika Grill House, etc.), no matching real business.

## Permit guide (permitted.html)

Every fact on the "How to get permitted in Calgary" page comes from one of these official pages, all **accessed 23 September 2026**. The page links the exact page, never a homepage, and states only what these pages say. It is general information, not legal advice.

- **S1** Alberta Health Services, *Starting a Food Business* (January 2026, PDF): <https://www.albertahealthservices.ca/assets/wf/eph/wf-eph-start-food-business.pdf>, accessed 23 September 2026. Supports: home-based businesses preparing high-risk foods need a Food Handling Permit; caterers need a permit for an approved kitchen; low-risk home-prepared food needs no permit and is direct-to-consumer only; plan review (scaled floor plan, at least six weeks before construction, through the City of Calgary's planning department in Calgary); building permits; final inspection only after construction is complete and equipment works; one certified food safety person; online application, inspection booked within 7 business days, invoice then permit by email, posted publicly, valid one year and renewed yearly; fee schedule Class I $100, Class II $175, Class III $250, Class IV $500; phone 1-833-476-4743, Monday to Friday.
- **S2** Alberta Health Services, *Open a Business*: <https://www.albertahealthservices.ca/eph/Page15563.aspx>, accessed 23 September 2026. Supports: the Food Handling Permit Application, Pay Permit Fee, and a form titled "Permission to Use an Approved Food Establishment".
- **S3** Alberta Health Services, *Public Health Inspection Reports*: <https://www.albertahealthservices.ca/eph/page3149.aspx>, accessed 23 September 2026. Supports: reports list violations only (safe practices aren't listed); usually posted within one business day, sometimes up to 5; they cover the past three years.
- **S4** Alberta Health Services, inspection report search: <https://ephisahs.albertahealthservices.ca/inspections/all/>, accessed 23 September 2026. Supports: the "Search AHS inspection reports" link.
- **S5** Alberta Health Services, *Environmental Public Health*: <https://www.albertahealthservices.ca/eph/eph.aspx>, accessed 23 September 2026. Supports: a live operator Monday to Friday at 1-833-476-4743.
- **S6** Government of Alberta, *Low-risk home-prepared foods*: <https://www.alberta.ca/low-risk-home-prepared-foods>, accessed 23 September 2026. Supports: low-risk foods don't need refrigeration (baked goods, candies, whole fresh produce, some canned goods); sold from home (including online or mail-order), at special events and farmers' markets; must be labelled.
- **S7** Alberta King's Printer, *Food Regulation*, Alta Reg 31/2006 (office consolidation current as of June 21, 2024, PDF): <https://kings-printer.alberta.ca/documents/Regs/2006_031.pdf>, accessed 23 September 2026. Supports: s.1(1)(y) and (y.1) definitions (no temperature control; own private dwelling; no meat, poultry, seafood or unpasteurized milk); s.3(1) permit for an approved food establishment and the s.3(3)(b) exemption; s.52.1(2) no resale; s.52.2(1)(f) label wording.
- **S8** City of Calgary, *Home-based food business*: <https://www.calgary.ca/for-business/licences/home-based-food-business.html>, accessed 23 September 2026. Supports: the Food Service – Premises licence; an AHS location inspection for any food business; Home Occupation Class 1 and Class 2 examples; Class 2 "does not guarantee an approval"; commercial building permit and possibly a mechanical permit for a second kitchen; development permit first; a separate licence for each location; don't sign a lease before checking location approval; Class 1 $0 and about 5 business days; Class 2 $449 + $32 = $481; building permit about 21 business days; Planning Services Centre (403) 268-5311.
- **S9** City of Calgary, *2026 Business Licence Fee Schedule* (PDF): <https://www.calgary.ca/content/dam/www/pda/pd/documents/fees/business-licence-fee-schedule.pdf>, accessed 23 September 2026. Supports: Food Service – Premises base fee $172 new, $131 renewal; notes 2 and 4 say the fire inspection and planning approval fees don't apply to home-based businesses (so the schedule's $330 / $248 totals aren't quoted as the home-based cost).

Notes:

- The AHS form "Permission to Use an Approved Food Establishment" (frm-19880, linked from S2) is an encrypted PDF that could not be read. The page names the form only and tells kitchens to ask AHS whether it applies to them, rather than describing what it requires.
- The City's page (S8) gives two different timelines for a Home Occupation – Class 2 permit: "Approximately 10-12 weeks" in its fee table, and "60 days to decision, plus 21 days advertisement/appeal period" in its timelines table. The permit guide quotes both.

## Permit guide fact-check, 23 Sep 2026

Two independent checkers compared permitted.html with its cited pages. Each flagged line was re-read against the official text (AHS *Starting a Food Business* PDF, Food Regulation PDF, City of Calgary home-based food business page, AHS inspection reports page and portal), all accessed 23 September 2026. Changes:

- Short version: now says what AHS says (commercial food businesses, incl. caterers and home-based businesses preparing high-risk foods, need a Food Handling Permit issued after an approval inspection; caterers need it for an approved kitchen) and what the Food Regulation says (s.3(3)(b) exempts only low-risk home-prepared food; s.1(1)(y.1) excludes meat, poultry, seafood, unpasteurized milk). "Tiffin" is no longer presented as named in the source.
- Step 1 and the exemption paragraph: the tiffin point is now framed as an inference from s.1(1)(y) ("without the need for temperature control"), with "ask AHS to confirm" and the phone number.
- Step 4 and the renting-route card: Class 1 / Class 2 now worded as the City's own location-approval examples ("second commercial grade kitchen within your home" = Class 2; "paperwork in your home office, and cooking from a licenced commercial kitchen" = Class 1). One checker read only the licence-type table and missed the type-of-use table; the direct check confirmed both examples.
- Step 6: food safety certification restated per s.31(1)-(3) (5 or fewer vs 6 or more food handlers; exceptions). Certificates come from Alberta-approved courses, not AHS (AHS guide Step 7). The route card no longer implies AHS issues the certificate.
- Step 8: permit is emailed after the fee is paid (AHS guide Step 10).
- Exemption card: heading now "no permit needed under the Food Regulation" (s.3(3)(b)); low-risk definition quoted from s.1(1)(y) alongside the Government of Alberta's "don't require refrigeration"; the not-covered items now cite s.1 and s.52.1(2), and the AHS guide line that LRHPF can't be sold or provided to permitted food facilities. The alberta.ca page alone didn't support these, which is why they were flagged.
- City licence line: now "the City says all home-based food businesses that prepare or sell food need a business licence and location approval", not a claim about exempt foods specifically.
- AHS fee row: removed "a year" from the amounts and "AHS decides which class applies" (not stated). Now says the guide lists the fee schedule, the permit is valid one year with an annual renewal fee invoiced, and to ask AHS which class applies.
- Inspection records: "past three years" added from page3149. "Search by name" replaced with browse by facility type, city/area and community (the visible portal controls); a name search couldn't be confirmed.
- Planning Services Centre card: the list of services was replaced with the City's own wording that a business approvals representative can help you work out which approvals you need.
- The "Your path" and "Two routes" source notes now also link the Food Regulation, which the rewritten steps cite. The sources list didn't change (all nine sources are still used).

Left as-is: the Home Occupation – Class 2 timeline. The City's page gives both "Approximately 10-12 weeks" (fee table) and "60 days to decision, plus 21 days advertisement/appeal period" (timelines table), and the guide already quotes both.

Not added: the checkers mentioned a low-risk home-prepared food fact sheet (uninspected eggs, cooked-in eggs/dairy). It wasn't opened directly, so it isn't cited.

## Tiffin 101 guide (overnight round 3)

Sources behind `guide.html`, all **accessed 24 September 2026**. Every factual claim on the page is supported by one of these; prices given on the page are described as "typical ranges" taken from this site's own sample data, not from any external source.

- **What a tiffin/dabba service is, and its history:** [Dabbawala, Wikipedia](https://en.wikipedia.org/wiki/Dabbawala) — supports the 1890 start by Mahadeo Havaji Bachche with about a hundred workers, the 1956 trust registration, and the 175,000–200,000 lunch boxes moved daily by 4,500–5,000 dabbawalas. [Tiffin carrier, Wikipedia](https://en.wikipedia.org/wiki/Tiffin_carrier) — supports what a tiffin carrier/dabba is (a stacked, usually steel, two- to four-tier lunchbox) and that "tiffin" is a colonial-era English term for a light midday meal.
- **What a typical tiffin meal contains:** [Thali, Wikipedia](https://en.wikipedia.org/wiki/Thali) — supports "typical dishes include rice, dal, vegetables, roti, papad, dahi (yogurt), small amounts of chutney or pickle, and a sweet dish," used as the basis for describing rice/roti, dal and sabzi as the common components of a home-style tiffin meal.
- **Price ranges:** taken directly from `data/kitchens.json` (this site's own 24 sample listings), not an external source: day prices $11–$15, weekly $60–$90, monthly $205–$320, trial weeks typically close to a kitchen's normal weekly price (per `tools/sample_decisions.py`, about 85% of the weekly price). The guide states plainly that these are typical ranges on sample listings, not quotes.
- **Food-safety basics (temperatures and timing):** [Health Canada, Food safety and you](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/food-safety-you.html) — supports "reheat food to at least 74°C (165°F)" and "refrigerate or freeze leftovers within two hours." [Health Canada, Safe food storage](https://www.canada.ca/en/health-canada/services/general-food-safety-tips/safe-food-storage.html) — supports the 4°C (40°F) to 60°C (140°F) temperature danger zone and setting a refrigerator to 4°C (40°F) or lower and a freezer to -18°C (0°F) or lower.
- The guide links to `permitted.html` for permit details and repeats the site's existing wording rules: never "AHS approved" or "verified by," and "a permit check is not a food-safety inspection or endorsement."
- The dish-glossary pointer links to the home page rather than duplicating any glossary entries, since the glossary only exists inline on kitchen pages (`data/dishes.json`, already sourced above).
