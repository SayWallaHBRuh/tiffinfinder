"""Give some of the sample kitchens a made-up (but plausible) nutrition panel.

Run from the tiffinfinder folder:

    python tools/sample_nutrition.py

For 8 of the 24 sample kitchens (chosen deterministically, see below) this
writes a "nutrition" object directly after "capacity" (matching the field
order in docs/listing-data.md's annotated example):

    "nutrition": {
      "per": "meal",
      "calories_min": <int>, "calories_max": <int>,
      "protein_min_g": <int>, "protein_max_g": <int>,
      "contains": [...],
      "notes": "<short factual note>",
      "estimated_on": "YYYY-MM-DD",
      "method": "kitchen estimate" | "recipe calculator" | "dietitian"
    }

Kitchens without "sample": true, and meta, are left exactly as they are.
Kitchens that already carry "nutrition" are left alone (re-running this
script is a no-op for them), so a hand-edited value is never overwritten.

Which 8: the 24 sample slugs sorted by sha256("nutrition:" + slug), the
first 8 taken. Calorie/protein ranges, method and date are all derived from
the same per-slug hash, so running this twice gives a byte-identical
data/kitchens.json (no randomness). "contains" is worked out from the
kitchen's own menu: every dish name is checked against data/dishes.json's
glossary, and dairy/fish tags there become "milk"/"fish"; a menu that
mentions roti, naan or paratha adds "wheat and triticale". This never adds
an allergen a veg-only or halal kitchen's own menu doesn't support (no
fish tag can appear unless a dish on that kitchen's own menu carries one).
"notes" is picked from the kitchen's own veg_only/halal flags, never a
nutrient-content or health claim.

Every value the panel shows is prefixed "Sample estimate" by the site
itself (app.js's nutritionPanel(), keyed off "sample": true) -- this script
doesn't need to say so in the data.

The file keeps its own newline style (LF or CRLF) and its trailing-newline
state. Standard library only, no network access.
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS = os.path.join(ROOT, 'data', 'kitchens.json')
DISHES = os.path.join(ROOT, 'data', 'dishes.json')

N_WITH_NUTRITION = 8

# Dish-glossary "contains" tags (dairy/fish/meat/onion_garlic/root_veg) that
# map onto Canada's priority allergens; meat/onion_garlic/root_veg are not
# allergens, so they're left out on purpose.
TAG_TO_ALLERGEN = {'dairy': 'milk', 'fish': 'fish'}
WHEAT_WORDS = ('roti', 'naan', 'paratha')


def fail(slug, reason):
    sys.stderr.write('sample_nutrition: ' + str(slug) + ': ' + reason + '\n')
    sys.exit(1)


def sha_hex(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def load_dish_glossary():
    with open(DISHES, 'rb') as fh:
        data = json.loads(fh.read().decode('utf-8'))
    return data.get('dishes', [])


def kitchen_menu_text(k):
    items = (k.get('menu') or {}).get('items') or []
    return ' '.join(str(i.get('dish') or '') for i in items).lower()


def kitchen_contains(k, glossary):
    text = kitchen_menu_text(k)
    tags = set()
    for entry in glossary:
        terms = entry.get('terms') or []
        if any(isinstance(t, str) and t.lower() in text for t in terms):
            for tag in entry.get('contains') or []:
                if tag in TAG_TO_ALLERGEN:
                    tags.add(TAG_TO_ALLERGEN[tag])
    if any(w in text for w in WHEAT_WORDS):
        tags.add('wheat and triticale')
    # A fixed, readable order rather than set iteration order.
    order = ['peanuts', 'tree nuts', 'sesame', 'milk', 'eggs', 'fish',
              'crustaceans and molluscs', 'soy', 'wheat and triticale',
              'mustard', 'sulphites']
    return [a for a in order if a in tags]


def kitchen_note(k):
    if k.get('veg_only'):
        return 'Vegetarian, mild spice by default.'
    if k.get('halal'):
        return 'Halal, mild spice available on request.'
    return 'Mild spice available on request.'


def build_nutrition(k):
    slug = k['slug']
    h = sha_hex('nutrition:' + slug)

    cal_min = 480 + (int(h[0:6], 16) % 180)          # 480-659
    cal_span = 70 + (int(h[6:9], 16) % 61)            # 70-130
    cal_max = cal_min + cal_span

    pro_min = 18 + (int(h[9:12], 16) % 12)            # 18-29
    pro_span = 6 + (int(h[12:14], 16) % 8)            # 6-13
    pro_max = pro_min + pro_span

    method_pick = int(h[14:16], 16) % 5
    method = 'kitchen estimate' if method_pick < 3 else ('recipe calculator' if method_pick == 3 else 'dietitian')

    # A recent, non-future date: 2026-09-08 through 2026-09-22 (today used
    # for this round is 2026-09-25), spread deterministically by slug.
    day = 8 + (int(h[16:18], 16) % 15)
    estimated_on = '2026-09-%02d' % day

    glossary = build_nutrition.glossary
    contains = kitchen_contains(k, glossary)

    return {
        'per': 'meal',
        'calories_min': cal_min,
        'calories_max': cal_max,
        'protein_min_g': pro_min,
        'protein_max_g': pro_max,
        'contains': contains if contains else None,
        'notes': kitchen_note(k),
        'estimated_on': estimated_on,
        'method': method,
    }


def main():
    with open(KITCHENS, 'rb') as fh:
        raw = fh.read()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    trailing = raw.endswith(newline.encode('ascii'))
    data = json.loads(raw.decode('utf-8'))
    kitchens = data.get('kitchens', [])

    build_nutrition.glossary = load_dish_glossary()

    samples = [k for k in kitchens if isinstance(k, dict) and k.get('sample') is True]
    for k in samples:
        if not isinstance(k.get('slug'), str) or not k['slug']:
            fail('?', 'sample kitchen with no slug')

    already = [k['slug'] for k in samples if isinstance(k.get('nutrition'), dict)]
    eligible = [k for k in samples if k['slug'] not in already]
    ranked = sorted(eligible, key=lambda k: sha_hex('nutrition:' + k['slug']))
    need = max(0, N_WITH_NUTRITION - len(already))
    chosen = {k['slug'] for k in ranked[:need]}

    if not chosen and not already:
        fail('samples', 'no sample kitchens found to give nutrition data to')

    decisions = {}
    for k in samples:
        if k['slug'] in chosen:
            n = build_nutrition(k)
            if not (isinstance(n['calories_min'], int) and 0 < n['calories_min'] <= n['calories_max'] <= 3000):
                fail(k['slug'], 'calorie range failed its own sanity check')
            if not (isinstance(n['protein_min_g'], int) and 0 <= n['protein_min_g'] <= n['protein_max_g'] <= 250):
                fail(k['slug'], 'protein range failed its own sanity check')
            decisions[k['slug']] = n

    total_with = len(already) + len(chosen)
    if total_with < min(N_WITH_NUTRITION, len(samples)):
        fail('samples', 'only %d of %d target sample kitchens ended up with nutrition data' % (total_with, N_WITH_NUTRITION))

    # nutrition goes directly after capacity; every other key keeps its
    # place and value. Kitchens that aren't chosen, or already have
    # nutrition, or aren't samples, are not touched.
    rebuilt = []
    for k in kitchens:
        if not (isinstance(k, dict) and k.get('slug') in decisions):
            rebuilt.append(k)
            continue
        out = {}
        for key, value in k.items():
            out[key] = value
            if key == 'capacity':
                out['nutrition'] = decisions[k['slug']]
        rebuilt.append(out)
    data['kitchens'] = rebuilt

    text = json.dumps(data, indent=2, ensure_ascii=False)
    if newline != '\n':
        text = text.replace('\n', newline)
    if trailing:
        text += newline
    with open(KITCHENS, 'wb') as fh:
        fh.write(text.encode('utf-8'))
    print('sample_nutrition: %d sample kitchen(s) now carry a nutrition panel (%d added this run)' % (total_with, len(chosen)))


if __name__ == '__main__':
    main()
