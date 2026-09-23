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

## Dish glossary (`data/dishes.json`)

Each description is a short paraphrase written for Tiffin Finder and checked against the source in that entry's `source` field. Wikipedia is used as a reference that anyone can open. Where a dish has no article of its own, the entry cites the cuisine article that names and describes it.

Articles each opened and checked:

- Cuisine articles: Punjabi, Pakistani, Gujarati, Hyderabadi, Bengali, Bangladeshi, Afghan, Nepalese, Sri Lankan and Filipino cuisine; Cuisine of Kerala; List of Indian dishes; Dal.
- Dish articles: Jeera rice (now titled "Jeera bhaat"), Kachumber, Aloo gobi, Aloo mattar ("Aloo mutter"), Chaas, Dal dhokli, Handvo, Chutney, Papadam, Aloo gosht, Korma, Mirchi ka salan, Dalcha, Double ka meetha, Lemon rice ("Chitranna"), Puliyodarai ("Pulihora"), Medu vada, Pongal (dish), Rosematta rice ("Matta rice"), Chettinad cuisine, Machher jhol, Shukto, Kosha mangsho (redirects to "Mutton curry", which names kosha mangsho), Borhani, Aloo tama, Kiri hodi, Atchara, Pancit.

Dishes dropped from the sample menus because no reliable source could be confirmed: paneer bhurji, tinda masala, lauki kofta, bhindi masala, vangi bath, daal mash, aloo bhujia, bhindi gosht, begun bhaja, aloo bhaja, aloo posto, cholar dal, bhetki paturi, dim kosha, ambul thiyal, wambatu moju, egg roast, moru curry. They were swapped for dishes that do have a source. The menus are fictional, so nothing real changed.

Checking method: Wikipedia refused direct automated requests from the build machine (HTTP 403), so each article was opened one at a time through a web reader and its opening description compared with the glossary line.
