"""Check data/kitchens.json is safe to list real kitchens from.

Run from the tiffinfinder folder:

    python tools/check_listings.py

Every kitchen with `"sample"` not `true` (a real kitchen) is checked against
the data model in docs/listing-data.md:

 1. The safety gate: permit.checked_on (a real, non-future ISO date),
    permit.source_url (https://) and consent.listing_ok (exactly true) are
    all present. app.js enforces the same three fields at runtime and skips
    (with a console.warn) any kitchen missing one; this script catches it
    before a commit ships.
 2. Every other required field is present and the right shape: slug, name,
    business_type (a known value), service (a known value), area,
    base_community, price, menu, contact (at least one of whatsapp/phone),
    delivery.areas.
 3. checked_on, expires (if present) and consent.written_on are real
    YYYY-MM-DD dates; expires (if present) is after checked_on.
 4. permit.holder_name_matches is exactly true.
 5. area, base_community.slug, and every delivery.areas entry name a
    community that exists in data/map/calgary.json (or airdrie.json for an
    Airdrie kitchen).
 6. pickup.label holds no street-address-shaped text when
    pickup.precision is "community" (never show a home address).
 7. None of the banned phrases ("AHS approved", "verified by", "Permit
    verified") appear anywhere in the file.

Prints one line per problem, naming the kitchen (or "file" for a whole-file
problem), and exits non-zero if anything fails. Never writes to the file.
Standard library only, no network access.
"""
from __future__ import print_function

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS_PATH = os.path.join(ROOT, 'data', 'kitchens.json')
CALGARY_PATH = os.path.join(ROOT, 'data', 'map', 'calgary.json')
AIRDRIE_PATH = os.path.join(ROOT, 'data', 'map', 'airdrie.json')

BANNED_PHRASES = ('AHS approved', 'verified by', 'Permit verified')

BUSINESS_TYPES = ('home_kitchen_permitted', 'restaurant', 'caterer', 'commissary_cook')
SERVICES = ('pickup', 'delivery', 'both')
PICKUP_PRECISIONS = ('exact', 'intersection', 'community')

ISO_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
# A street-address shape: a leading house number, then a street-type word
# somewhere after it. Deliberately broad -- false positives are safer than
# a home address slipping through a neighbourhood-only listing.
ADDRESS_RE = re.compile(
    r'\d{1,6}\s+\S+.*\b('
    r'st|street|ave|avenue|rd|road|dr|drive|way|cres|crescent|ct|court|'
    r'pl|place|blvd|boulevard|ln|lane|cl|close|cir|circle|trl|trail|gate|'
    r'bay|manor|row|pkwy|parkway|grove|heights|link|mews|park|point|pt|'
    r'ridge|rise|terrace|view|villas|walk'
    r')\b',
    re.I
)

FAILURES = []


def fail(slug, msg):
    FAILURES.append('%s: %s' % (slug, msg))


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def iso_day(s):
    """A real calendar day as YYYY-MM-DD, else None."""
    if not isinstance(s, str) or not ISO_DATE_RE.match(s):
        return None
    import datetime
    try:
        datetime.date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
    except ValueError:
        return None
    return s


def load_communities(path):
    if not os.path.isfile(path):
        return set()
    with open(path, 'rb') as fh:
        data = json.loads(fh.read().decode('utf-8'))
    return set(c['slug'] for c in data.get('communities', []) if isinstance(c, dict) and 'slug' in c)


def community_slug(name):
    s = str(name or '').lower()
    s = s.replace("'", '').replace('’', '')
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def check_kitchen(k, communities):
    slug = k.get('slug') if isinstance(k, dict) else None
    label = slug if isinstance(slug, str) and slug else '(kitchen with no slug)'

    if not isinstance(k, dict):
        fail(label, 'kitchen entry is not an object')
        return
    if not isinstance(slug, str) or not slug:
        fail(label, 'slug is required')
    if not isinstance(k.get('name'), str) or not k['name'].strip():
        fail(label, 'name is required')

    bt = k.get('business_type')
    if bt not in BUSINESS_TYPES:
        fail(label, 'business_type must be one of %s, got %r' % (BUSINESS_TYPES, bt))

    service = k.get('service')
    if service not in SERVICES:
        fail(label, 'service must be one of %s, got %r' % (SERVICES, service))

    # --- Communities -------------------------------------------------
    area = k.get('area')
    base = k.get('base_community') if isinstance(k.get('base_community'), dict) else {}
    base_slug = base.get('slug')
    city = base.get('city')
    if city not in ('calgary', 'airdrie'):
        fail(label, 'base_community.city must be "calgary" or "airdrie", got %r' % (city,))
    if not isinstance(area, str) or not area.strip():
        fail(label, 'area is required')
    elif not isinstance(base_slug, str) or community_slug(area) != base_slug:
        fail(label, 'base_community.slug (%r) must equal the slug of area (%r)' % (base_slug, area))
    if isinstance(base_slug, str) and base_slug not in communities.get(city, set()):
        fail(label, 'base_community.slug %r is not a known %s community' % (base_slug, city))

    delivery = k.get('delivery') if isinstance(k.get('delivery'), dict) else {}
    areas = delivery.get('areas')
    if not isinstance(areas, list):
        fail(label, 'delivery.areas must be a list (use [] for pickup-only)')
        areas = []
    for a in areas:
        if not isinstance(a, str) or not a.strip():
            fail(label, 'delivery.areas has an empty or non-text entry')
            continue
        a_slug = community_slug(a)
        known = communities.get('calgary', set()) | communities.get('airdrie', set())
        if a_slug not in known:
            fail(label, 'delivery area %r is not a known Calgary or Airdrie community' % (a,))

    # --- Pickup --------------------------------------------------------
    pickup = k.get('pickup')
    if service in ('pickup', 'both'):
        if not isinstance(pickup, dict):
            fail(label, 'pickup is required when service is "%s"' % service)
        else:
            precision = pickup.get('precision')
            if precision not in PICKUP_PRECISIONS:
                fail(label, 'pickup.precision must be one of %s, got %r' % (PICKUP_PRECISIONS, precision))
            plabel = pickup.get('label')
            if not isinstance(plabel, str) or not (1 <= len(plabel.strip()) <= 80):
                fail(label, 'pickup.label must be 1-80 characters')
            elif precision == 'community' and ADDRESS_RE.search(plabel):
                fail(label, 'pickup.label %r looks like a street address; use the neighbourhood name only when precision is "community"' % (plabel,))
    elif pickup is not None:
        fail(label, 'pickup must be null when service is "delivery"')

    # --- Price / plans ---------------------------------------------------
    price = k.get('price')
    if not isinstance(price, dict):
        fail(label, 'price must be an object (day/weekly/monthly may be absent)')
    else:
        for key in ('day', 'weekly', 'monthly'):
            if key in price and price[key] is not None and not is_number(price[key]):
                fail(label, 'price.%s must be a number or null' % key)

    menu = k.get('menu')
    if not isinstance(menu, dict) or not isinstance(menu.get('items'), list):
        fail(label, 'menu.items must be a list')

    # --- Contact ---------------------------------------------------------
    contact = k.get('contact') if isinstance(k.get('contact'), dict) else {}
    whatsapp = contact.get('whatsapp')
    phone = contact.get('phone')
    has_whatsapp = isinstance(whatsapp, str) and re.sub(r'\D', '', whatsapp)
    has_phone = isinstance(phone, str) and phone.strip()
    if not (has_whatsapp or has_phone):
        fail(label, 'contact needs at least one of whatsapp or phone')

    # --- Permit (the safety gate) ----------------------------------------
    permit = k.get('permit') if isinstance(k.get('permit'), dict) else {}
    checked_on = iso_day(permit.get('checked_on'))
    if not checked_on:
        fail(label, 'permit.checked_on must be a real YYYY-MM-DD date (required to list)')
    else:
        import datetime
        if checked_on > datetime.date.today().isoformat():
            fail(label, 'permit.checked_on is in the future')

    expires = permit.get('expires')
    if expires is not None:
        expires_day = iso_day(expires)
        if not expires_day:
            fail(label, 'permit.expires must be a real YYYY-MM-DD date')
        elif checked_on and expires_day < checked_on:
            fail(label, 'permit.expires (%s) is before permit.checked_on (%s)' % (expires_day, checked_on))

    source_url = permit.get('source_url')
    if not (isinstance(source_url, str) and source_url.startswith('https://')):
        fail(label, 'permit.source_url must be an https:// link (required to list)')

    if permit.get('holder_name_matches') is not True:
        fail(label, 'permit.holder_name_matches must be exactly true (confirm the permit holder\'s name matches before listing)')

    # --- Consent (the safety gate) ---------------------------------------
    consent = k.get('consent') if isinstance(k.get('consent'), dict) else {}
    if consent.get('listing_ok') is not True:
        fail(label, 'consent.listing_ok must be exactly true (required to list)')
    written_on = consent.get('written_on')
    if written_on is not None and not iso_day(written_on):
        fail(label, 'consent.written_on must be a real YYYY-MM-DD date')


def check_banned_phrases(raw_text):
    low = raw_text.lower()
    for phrase in BANNED_PHRASES:
        if phrase.lower() in low:
            fail('file', 'banned phrase found: %r' % (phrase,))


def main():
    if not os.path.isfile(KITCHENS_PATH):
        print('FAIL: data/kitchens.json not found')
        return 1

    with open(KITCHENS_PATH, 'rb') as fh:
        raw = fh.read().decode('utf-8')
    data = json.loads(raw)
    kitchens = data.get('kitchens', [])

    check_banned_phrases(raw)

    communities = {
        'calgary': load_communities(CALGARY_PATH),
        'airdrie': load_communities(AIRDRIE_PATH),
    }

    real = [k for k in kitchens if isinstance(k, dict) and k.get('sample') is not True]
    for k in real:
        check_kitchen(k, communities)

    print('== Tiffin Finder listing check ==\n')
    print('%d kitchen(s) total, %d real (non-sample), %d sample' % (
        len(kitchens), len(real), len(kitchens) - len(real)))

    if FAILURES:
        print('\n%d problem(s) found:' % len(FAILURES))
        for f in FAILURES:
            print(' - ' + f)
        return 1

    print('\nAll real kitchens pass. (No real kitchens yet is fine -- this just means nothing failed.)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
