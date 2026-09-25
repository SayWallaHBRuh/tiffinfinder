# First real kitchen — launch runbook

For Adeel. This is the full path from "a kitchen said yes" to "the site
shows them live", written for a beginner with no terminal experience — you
gather information and make decisions, Claude does every technical step.
Keep this page open and follow it top to bottom; nothing here needs to be
memorized.

This is general information to help the process go smoothly, not legal
advice, and it does not replace `TIFFIN-FINDER-HANDOFF.md` or
`docs/adding-a-kitchen.md`, which it draws from. **Nobody signs anything
and nobody pays anything until the lawyer/RCIC sign-off in the handoff
(§5, §8) has happened.** If that hasn't happened yet, stop here and go do
that first — everything below assumes it's done.

## Before you start: the one-time switch check

Do this once, any time before the first kitchen, not on launch day itself:

1. Tell Claude "run the launch rehearsal." It runs
   `python tools/rehearse_launch.py`, which copies the site to a temp
   folder, turns samples off **in that copy only** (your real site is
   untouched), and screenshots what households would see with zero real
   kitchens live. Claude looks at the screenshots and tells you if
   anything reads oddly. Re-run it any time you're not sure the switch
   still works cleanly, especially after a design change.

## Step by step: one real kitchen, start to finish

### 1. Kitchen said yes

You've had the conversation (the outreach plan has the script), and the
kitchen wants to be listed. Nothing is public yet — this step is just
"yes, let's do this."

### 2. Collect their details

Follow `docs/adding-a-kitchen.md` §2 — sit with the kitchen (in person, on
a call, or by message) and collect all nine items: type of place, name,
cuisine, this week's menu, prices, trial week, pickup/delivery details,
whether they're taking new customers, and a WhatsApp or phone number.
Write it down in your own notes, in your own words — you don't need to
know the JSON shape, Claude turns your notes into it later.

### 3. Check the permit, and copy the public record link

Follow `docs/adding-a-kitchen.md` §3:

1. Open `https://inspectionsonline.chr.alberta.ca/` and search for the
   kitchen's name or address.
2. Confirm the name on the record matches who you're listing, and that
   the record is current (not expired, not closed).
3. **Copy the link to that facility's own page** — the address bar URL
   once you're on that specific facility's record, not the search results
   page. This is `permit.source_url`; it must start with `https://`.
4. Note today's date (`permit.checked_on`) and, if shown, the expiry date
   (`permit.expires`).

If you can't get a link that stays the same when you revisit it later
(a "durable" link, not a session-only search result), stop and flag it —
this is the open question in `plans/next-backlog.md` item A.3, and it
needs a decision before this kitchen can go live with that record type.

Never write "AHS approved" or "verified by" anywhere, including in your
own notes that you'll paste to Claude — those words are banned on the site
on purpose.

### 4. Get consent, in writing — and log it privately

Follow `docs/adding-a-kitchen.md` §4: get the kitchen's OK **in writing**
(a text, an email, or a signed note) that they're fine being listed with
the information you've collected.

- **Keep the actual message yourself, off both repos.** Never paste the
  consent text itself into anything Claude edits or commits — the public
  site repo (`C:\tiffinfinder\site`) must never contain it, and even the
  private handoff repo only holds a *record that consent happened*, not
  the message itself.
- Fill in one row of your private consent log using the template at
  `plans/consent-log-template.md` (in the private handoff repo, not the
  site repo) — it has the plain-language fields to capture and a CSV
  header line for a private spreadsheet.
- Tell Claude only the **date** consent was given. That becomes
  `consent.written_on`; Claude sets `consent.listing_ok: true` once you
  confirm it.

### 5. Enter the listing

Tell Claude what you collected in steps 2-4. Claude:

1. Adds one entry to `data/kitchens.json`, following
   `docs/listing-data.md` field by field, with `"sample": false`. The full
   annotated example near the bottom of that file (a complete, made-up
   but realistic home kitchen) is exactly the shape yours will take —
   Claude uses it as the template.
2. Runs `python tools/check_listings.py` (or the full
   `python tools/check_ship.py`, which includes it) — this is the
   automatic check that your new listing has everything required: a
   checked permit, a source link, consent, a real community name, and
   nothing that reads like an AHS endorsement.
3. Fixes anything it flags on its own, or comes back and asks you for
   whatever's still missing.

### 6. Run the full ship check

Claude runs:

```
python tools/check_ship.py
```

This is the same check that runs before every change to the site — CNAME
unchanged, no banned phrases, security headers intact, every link
resolves, one heading per page, and (new from this round)
`tools/check_links.py` in offline mode, plus your new listing data. It
must say "All checks passed." before moving on.

### 7. Rehearse locally, one more time, with this kitchen in the mix

Claude runs `python tools/rehearse_launch.py` again. This time the
rehearsal copy will have `show_samples: false` **and** your new real
kitchen, in the temp copy only — so you get to see exactly what the home
page, the kitchen's own page, and the map will look like once the switch
is actually flipped, without touching the live site. Look over the
screenshots together before going further.

### 8. Flip `show_samples` to `false` — only on your word

This is the one step that changes what every visitor sees, so it only
happens when you explicitly say "flip it" — not automatically, not as
part of "add the kitchen." When you're ready:

- Claude edits `data/kitchens.json`, changing `"show_samples": true` to
  `"show_samples": false` (see README.md, "Showing or hiding the sample
  kitchens", for exactly what this does and how to undo it).
- This is a separate, clearly-labelled step in whatever Claude commits —
  never bundled silently into an unrelated change.

### 9. Push

Claude commits with a clear message and pushes to `main`
(`SayWallaHBRuh/tiffinfinder`, the public site repo). Nothing about the
kitchen's consent record or your private notes goes into this commit —
only `data/kitchens.json` and anything else that changed.

### 10. Confirm the deploy

From `C:\tiffinfinder\site`, Claude runs:

```
gh api repos/SayWallaHBRuh/tiffinfinder/pages/builds/latest --jq ".status + \" \" + .commit"
```

It should say `built <the commit you just pushed>`. If it still shows an
older commit, wait a minute and check again — GitHub Pages usually
finishes in under two minutes.

### 11. Check the live URLs

Once the build shows your commit, open (or have Claude fetch, if your
network can't reach the live site):

- `https://tiffinfinder.ca/` — should show the real kitchen, not the
  sample kitchens, not the "Launching in NE Calgary" page.
- `https://tiffinfinder.ca/?k=<the kitchen's slug>` — the kitchen's own
  page.
- `https://tiffinfinder.ca/?k=<the kitchen's slug>&solo=1` — the
  kitchen's own link (no header menu, no other listings) — this is the
  link you'll actually hand the kitchen in the next step.
- `https://tiffinfinder.ca/?demo=1` — samples should still appear here,
  with the Demo banner, confirming the switch didn't delete the sample
  data, only hid it.

### 12. Share the link with the kitchen

Send the kitchen their own link
(`https://tiffinfinder.ca/?k=<slug>&solo=1`) — this is what the outreach
plan's Day 0 step calls "the live link." Follow
`plans/strategy-merged.json`'s `first_30_days` from here: a WhatsApp
status poster and a short check-in within a few days to make sure
everything reads right to them.

## If something goes wrong partway through

- **Before step 8 (the flip):** nothing public has changed yet. Fix the
  issue and re-run from wherever you stopped.
- **After step 9 (pushed) but the ship check would have failed:** it
  can't happen — step 6 runs before step 8, and `check_ship.py` blocks a
  bad push. If you ever push outside this process, run
  `python tools/check_ship.py` immediately after and fix any failure with
  a new commit.
- **The kitchen asks you to pause or change something after it's live:**
  see `docs/takedown-and-updates.md`.
