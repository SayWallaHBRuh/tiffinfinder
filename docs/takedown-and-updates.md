# Takedown and updates — a runbook for kitchen requests

For Adeel. What to do when a listed kitchen asks you to change something,
pause, or come off the site entirely, and how permit expiry is handled
automatically. General information, not legal advice.

The site's own privacy and terms pages already make two promises that this
runbook exists to keep:

- **privacy.html**: "Kitchens can ask us to change or remove their listing
  at any time," with a target of a reply within 48 hours for privacy
  requests.
- **terms.html**: "Our target is to respond and act, by correcting,
  pausing or removing the listing, within 48 hours of hearing from you."

So: **48 hours from hearing from the kitchen to acting**, every time,
whichever kind of request it is.

## 1. A kitchen asks to change something (price, menu, pickup spot, hours, contact number, anything)

1. Get the change in the same way you'd get any listing detail — a
   message, a call, whatever's easiest for them. You don't need a new
   written consent for a routine detail change (only for a brand-new
   listing or a change to *what's public*, like switching pickup
   precision — see `docs/adding-a-kitchen.md` §5, which explicitly says
   this is "a normal, supported choice" they can make "anytime").
2. Tell Claude what changed. Claude edits that one kitchen's entry in
   `data/kitchens.json`, runs `python tools/check_ship.py`, and pushes.
3. Confirm the deploy the usual way (handoff §4 / `docs/launch-runbook.md`
   step 10), then let the kitchen know it's live.
4. All of this within 48 hours of the kitchen's message.

## 2. A kitchen asks to be removed

This is the "delist" case. The goal: the listing disappears from every
page a household would browse, **and their own link keeps working** but
shows a clear, friendly notice instead of an error — never a broken page,
never their old details.

### How the site already handles this

`app.js` reads every kitchen from `data/kitchens.json`. A slug that isn't
in the file at all (because you deleted the entry, which is what removal
means) renders the "No longer listed" empty state on that kitchen's own
`?k=<slug>` page: a heading, one line saying the kitchen may have closed,
taken a break, or asked to come off the site, and a link back to "Browse
all kitchens." It does **not** say "not found" or read like a broken
link — the wording was written and checked in this round specifically so
a delisted kitchen's old link, poster QR code, or WhatsApp status still
lands somewhere honest and calm rather than an error page.

(A slug that belongs to a **sample** kitchen that's hidden because
`show_samples` is `false` shows a different message — "This was a sample
listing" — since that's not a removal, just the pre-launch state. Real
removals always go through the "No longer listed" message above.)

### Steps

1. Confirm the request is really from the kitchen (not a third party) —
   a message from the number or account already on file for them is
   enough; no extra proof needed.
2. Tell Claude "remove `<kitchen name>`" and, if you have it, why (closed,
   paused, or just wants off) — this only helps your own notes, it's
   never shown on the site.
3. Claude deletes that kitchen's whole entry from `data/kitchens.json`
   (not just hides it), runs `python tools/check_ship.py`, and pushes.
4. Claude confirms the deploy, then checks `https://tiffinfinder.ca/?k=
   <slug>` itself and confirms it shows "No longer listed", not an error.
5. **Log it.** Add a line to your private consent log
   (`plans/consent-log-template.md` in the private handoff repo) noting
   the removal date and who asked — the same place written consent is
   logged, so there's one record per kitchen covering both "how they said
   yes" and "if/when they said stop."
6. All of this within 48 hours of the kitchen's request.

### A pause, not a full removal

If a kitchen just wants a break (vacation, short closure) rather than a
permanent removal, don't delete the entry — set `"taking_new_customers"`
(the `capacity` field) to `"full"` and, if they'll be gone more than a
couple of weeks, ask if they'd rather you remove the listing temporarily
and re-add it when they're back (re-adding is exactly `docs/launch-
runbook.md` steps 5-7 again — no permit re-check needed if `checked_on`
is still recent and nothing else changed).

## 3. Permit expiry (automatic, no kitchen request needed)

This one doesn't wait for anyone to ask — it's built into how the data
works, described in `docs/listing-data.md`:

- Every real kitchen carries `permit.expires` (if known). Once that date
  is in the past, the site itself — no edit needed — shows "Permit being
  re-checked" on that kitchen instead of "Permit checked", pauses
  ordering ("Ordering paused"), and stops counting it as permit-checked
  anywhere that matters (filters, capacity, etc.).
- **This is not the same as removal.** The listing stays visible (so
  households and the kitchen both see the "being re-checked" state,
  rather than the kitchen silently vanishing), but no one can order until
  it's re-checked.
- **What you do:** when you see (or a kitchen tells you) a permit is
  about to expire or has expired, repeat `docs/adding-a-kitchen.md` §3 —
  check the AHS public inspection database again, confirm the record is
  current, and update `permit.checked_on` / `permit.expires` /
  `permit.source_url` for that one kitchen. Tell Claude the new dates;
  Claude updates the entry, runs the ship check, and pushes.
- If the permit record shows the kitchen's permit was actually
  **suspended or cancelled** (not just due for renewal), treat it as a
  removal (section 2 above), not a routine re-check — don't leave a
  suspended kitchen showing "being re-checked" as if it's a formality.
- Terms.html already asks kitchens to tell you within 48 hours if their
  permit lapses or changes — this expiry handling is the safety net for
  when they don't get to you first.

## Quick reference

| Situation | What changes in the data | What the household sees |
|---|---|---|
| Detail change (price, menu, hours, pickup) | That field, same entry | Updated listing, same link |
| Kitchen asks to be removed | Whole entry deleted | "No longer listed" on their old link |
| Kitchen takes a short break | `capacity` set to `"full"` (or removed + re-added later) | "Not taking new customers" or "No longer listed" |
| Permit expires (no action from anyone) | Nothing — automatic | "Permit being re-checked", ordering paused |
| Permit suspended/cancelled | Treat as removal | "No longer listed" |

Every row: act within 48 hours of hearing about it (or, for permit expiry,
within 48 hours of finding out it happened).
