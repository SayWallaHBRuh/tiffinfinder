"""Cross-check kitchen menus in data/kitchens.json against the diet flags
each kitchen sets (veg_only, jain, halal) and the dish glossary in
data/dishes.json.

Run from the tiffinfinder folder:

    python tools/check_diet.py

What it does
------------
Each kitchen's sample menu (`menu.items[].dish`, a free-text line such as
"Rajma, jeera rice, 4 rotis, kachumber salad") is matched against the same
dish glossary terms app.js uses on kitchen pages (data/dishes.json,
`dishes[].terms`), using the same "whole word, longest term first" rule.
Where a matched dish has an optional `contains` list (categories:
"meat", "fish", "egg", "dairy", "onion_garlic", "root_veg"), this script
flags it against the kitchen's own flags:

  - veg_only kitchen/plan listing a dish that contains meat, fish or egg.
  - jain kitchen listing a dish that contains onion_garlic or root_veg,
    UNLESS the kitchen's own description says its food is prepared the
    Jain way (no onion, no garlic, no root vegetables) -- app.js shows
    that description on the kitchen page, so a household already sees it.
  - halal is never checked here: a dish name alone can't say whether meat
    was halal-slaughtered, so this script only prints a reminder, never a
    pass/fail claim about halal status.

`contains` is optional and conservative: most dishes have no `contains` at
all (unknown, not "contains nothing"), so this script can only flag a
contradiction it can actually see in the data -- it cannot prove a menu is
clean, only catch a stated contradiction.

Exit code is 0 with no problems found, 1 otherwise. Standard library only,
deterministic (same input always gives the same output, no network).
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS = os.path.join(ROOT, 'data', 'kitchens.json')
DISHES = os.path.join(ROOT, 'data', 'dishes.json')

MEAT_LIKE = ('meat', 'fish', 'egg')
JAIN_LIKE = ('onion_garlic', 'root_veg')
KNOWN_CATEGORIES = ('meat', 'fish', 'egg', 'dairy', 'onion_garlic', 'root_veg')

# Phrases in a kitchen's own description that tell a household its food is
# prepared the Jain way -- app.js shows this text on the kitchen page, so a
# jain: true kitchen that says this is not a silent contradiction.
JAIN_PREP_HINTS = ('no onion', 'no garlic', 'jain way', 'jain-style', 'jain style')


def load_json(path):
    with open(path, 'rb') as fh:
        raw = fh.read()
    return json.loads(raw.decode('utf-8'))


def build_glossary(dishes_doc):
    """term (lowercase) -> dish entry, plus one regex that finds any term as
    a whole word. Mirrors buildGlossary() in app.js so this script flags the
    same dish mentions a household would see underlined on the kitchen page."""
    entries = dishes_doc.get('dishes', [])
    if not isinstance(entries, list):
        entries = []
    by_term = {}
    terms = []
    for d in entries:
        if not isinstance(d, dict):
            continue
        if not isinstance(d.get('id'), str) or not isinstance(d.get('terms'), list):
            continue
        for t in d['terms']:
            if not isinstance(t, str):
                continue
            key = t.strip().lower()
            if not key or key in by_term:
                continue
            by_term[key] = d
            terms.append(key)
    if not terms:
        return None
    terms.sort(key=len, reverse=True)
    escaped = [re.escape(t) for t in terms]
    pattern = re.compile(r'(?:^|[^a-z])(' + '|'.join(escaped) + r')(?![a-z])', re.IGNORECASE)
    return by_term, pattern


def dishes_in_line(glossary, text):
    by_term, pattern = glossary
    found = []
    for m in pattern.finditer(str(text or '')):
        entry = by_term.get(m.group(1).lower())
        if entry is not None:
            found.append(entry)
    return found


def validate_dishes_doc(dishes_doc):
    problems = []
    entries = dishes_doc.get('dishes', [])
    for d in entries if isinstance(entries, list) else []:
        if not isinstance(d, dict):
            continue
        contains = d.get('contains')
        if contains is None:
            continue
        if not isinstance(contains, list) or not all(isinstance(c, str) for c in contains):
            problems.append('dish ' + str(d.get('id', '?')) + ': "contains" must be a list of strings')
            continue
        bad = sorted(set(contains) - set(KNOWN_CATEGORIES))
        if bad:
            problems.append('dish ' + str(d.get('id', '?')) + ': unknown contains categories ' + ', '.join(bad))
    return problems


def is_jain_prepared(description):
    text = str(description or '').lower()
    return any(hint in text for hint in JAIN_PREP_HINTS)


def check_kitchen(kitchen, glossary):
    problems = []
    slug = kitchen.get('slug', '?')
    veg_only = kitchen.get('veg_only') is True
    jain = kitchen.get('jain') is True
    jain_prepared = jain and is_jain_prepared(kitchen.get('description'))

    menu = kitchen.get('menu') or {}
    items = menu.get('items') or []
    if not isinstance(items, list):
        return problems

    for item in items:
        if not isinstance(item, dict):
            continue
        dish_line = item.get('dish')
        day = item.get('day', '?')
        matches = dishes_in_line(glossary, dish_line)
        for entry in matches:
            contains = entry.get('contains')
            if not isinstance(contains, list):
                continue
            name = entry.get('name', entry.get('id', '?'))

            if veg_only:
                hit = [c for c in MEAT_LIKE if c in contains]
                if hit:
                    problems.append(
                        slug + ' (' + day + '): veg_only kitchen lists "' + name +
                        '" which contains ' + ', '.join(hit) + ' -- menu line: "' + str(dish_line) + '"'
                    )

            if jain and not jain_prepared:
                hit = [c for c in JAIN_LIKE if c in contains]
                if hit:
                    problems.append(
                        slug + ' (' + day + '): jain kitchen lists "' + name +
                        '" which contains ' + ', '.join(hit) +
                        ', and the kitchen description does not say food is prepared the Jain way' +
                        ' -- menu line: "' + str(dish_line) + '"'
                    )
    return problems


def main():
    kitchens_doc = load_json(KITCHENS)
    dishes_doc = load_json(DISHES)

    doc_problems = validate_dishes_doc(dishes_doc)
    glossary = build_glossary(dishes_doc)
    if glossary is None:
        sys.stderr.write('check_diet: data/dishes.json has no usable glossary terms; nothing to check\n')
        sys.exit(1)

    kitchens = kitchens_doc.get('kitchens', [])
    if not isinstance(kitchens, list):
        kitchens = []

    problems = list(doc_problems)
    halal_count = 0
    for k in kitchens:
        if not isinstance(k, dict):
            continue
        if k.get('halal') is True:
            halal_count += 1
        problems.extend(check_kitchen(k, glossary))

    if halal_count:
        print('check_diet: ' + str(halal_count) + ' kitchen(s) marked halal -- '
              "halal can't be checked from dish names alone, so this script makes no claim either way.")

    if problems:
        sys.stderr.write('check_diet: ' + str(len(problems)) + ' problem(s) found:\n')
        for p in problems:
            sys.stderr.write('  - ' + p + '\n')
        sys.exit(1)

    print('check_diet: OK -- ' + str(len(kitchens)) + ' kitchens checked against ' +
          str(len(dishes_doc.get('dishes', []))) + ' glossary dishes, no contradictions found.')


if __name__ == '__main__':
    main()
