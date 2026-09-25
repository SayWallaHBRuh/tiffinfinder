# Adding a kitchen — a plain-English checklist

For Adeel. No terminal skills needed for this part: you collect the
information below, then tell Claude "add this kitchen" and paste what you
have. Claude does the JSON editing, runs the checks, and tells you what's
left.

This is general information to help you gather what's needed. It is not
legal advice. **Have a lawyer review the listing wording (and this process)
before the very first real kitchen goes live** — that's already a to-do
from the handoff, and it hasn't been done yet.

## 1. Before you talk to a kitchen

- Never walk into a home kitchen uninvited (this is someone's home).
- Be ready to explain, in one sentence: "Tiffin Finder is a free directory.
  Households find you and message you directly on WhatsApp or by phone —
  we never take a cut, never take orders, never see your money."
- The one rule to be listed: a checked permit, and their OK in writing.

## 2. What to collect from the kitchen

Ask for, or confirm, each of these:

1. **What kind of place it is** — a home kitchen, a restaurant, a catering
   business, or a cook renting a commercial (commissary) kitchen. This
   becomes `business_type` (see `docs/listing-data.md`).
2. **Name** they want shown.
3. **Cuisine**, and any of: vegetarian-only, halal, Jain.
4. **This week's menu** — day, dish, price per day.
5. **Prices** — per day, per week, per month (any that apply; they don't
   need all three).
6. **Trial week** — do they offer one, and at what price (or "ask the
   kitchen")?
7. **Pickup, delivery, or both**, and:
   - If pickup: ask how precisely they want their spot shown (see step 4
     below) — never collect or publish a home address without asking this.
   - If delivery: which neighbourhoods they deliver to.
8. **Taking new customers right now?** — open, waitlist, or full.
9. **Contact** — a WhatsApp number, a phone number, or both. (Not a
   personal email; households message the kitchen directly.)

## 3. Check the permit (AHS public inspection database)

1. Go to the Alberta Health Services public inspection database:
   `https://inspectionsonline.chr.alberta.ca/` (this is the "AHS public
   inspection database" — search it by the kitchen's name or address).
2. Find the specific facility the kitchen told you about, and confirm:
   - the **name on the permit record matches** who you're listing (this
     becomes `permit.holder_name_matches: true` — only set it `true` once
     you've actually checked this)
   - the record is current (not expired, not "closed")
3. Copy the **link to that facility's own page** in the database — that's
   `permit.source_url`. It must start with `https://`.
4. Note today's date — that's `permit.checked_on`.
5. If the record shows an expiry date, note it too — that's
   `permit.expires`.

Never write "AHS approved" or "verified by" anywhere — those words are
banned on this site on purpose (checking a permit record is not a
food-safety inspection or an endorsement, and the wording must never imply
otherwise).

## 4. Get written consent

Before the listing goes live, get the kitchen's OK **in writing** (a text
message, email, or a signed note is all fine) that says, in their own
words or yours: "Yes, you can list [kitchen name] on Tiffin Finder with
the information I've given you."

- Keep the original message yourself (off this repo — it doesn't need to
  be in any file Claude edits).
- Just tell Claude the date it was given — that becomes
  `consent.written_on`, and `consent.listing_ok: true`.
- Nothing about consent is ever shown on the site — it's only kept so we
  can prove permission was given.

## 5. Choose the pickup precision

If the kitchen offers pickup, ask them to choose one of three ways to
share their spot (never publish a home address without this choice):

- **Exact** — their real address. Shows "Pickup at …" plus a directions
  link.
- **Nearest intersection** — like "36 St & 88 Ave NE". Shows "Pickup
  near …" plus a directions link.
- **Neighbourhood only** — just the community name, like "Saddle Ridge".
  Shows "Pickup in Saddle Ridge", with no address and no directions link.
  They tell the household the exact spot when the household orders.

Most home kitchens will want neighbourhood-only. That's fine — it's a
normal, supported choice, not a lesser one.

## 6. Where it gets added

Tell Claude what you collected (steps 2–5 above), including the permit
link and date, and the consent date. Claude:

1. Adds the kitchen to `data/kitchens.json` following the shape in
   `docs/listing-data.md`, with `"sample": false`.
2. Runs `python tools/check_ship.py` (this includes
   `tools/check_listings.py`, which checks the permit, consent, community
   names, pickup wording and everything else on this list).
3. Fixes anything it flags, or asks you for whatever's missing.
4. Tells you in plain words what the listing will look like before it
   goes live.

## 7. Publish

Once the checks pass, tell Claude to publish it. Claude commits and pushes
(or tells you the one command to run, if you're doing it yourself), and
confirms the deploy the way every other round has been shipped (handoff
§4).

## A note on the samples

Until real kitchens are ready to go live, the 24 sample kitchens stay on
(`meta.show_samples: true`) so the site looks and works the same as always.
They come off only just before the first real outreach — that's a separate,
already-agreed decision (see `plans/overnight-loop.md`), not something this
checklist changes.
