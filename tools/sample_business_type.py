"""Give the sample kitchens a made-up business_type.

Run from the tiffinfinder folder:

    python tools/sample_business_type.py

For every kitchen with "sample": true this writes one key directly after
"sample":

    "business_type": "home_kitchen_permitted" | "restaurant" | "caterer" | "commissary_cook"

Kitchens without "sample": true, and meta, are left exactly as they are.

About 70% of the samples are "home_kitchen_permitted" (mirroring the mix the
real directory expects at launch); the rest are split as evenly as possible
across "restaurant", "caterer" and "commissary_cook". Every sample keeps
"Sample" on its card whatever its business_type says (app.js never shows
permit wording for a sample).

Picked with a fixed recipe (sha256 hashes of the slugs, no randomness), so
running this twice gives a byte-identical data/kitchens.json. The file keeps
its own newline style (LF or CRLF) and its trailing-newline state. Standard
library only.
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS = os.path.join(ROOT, 'data', 'kitchens.json')

# Order matters only for the fallback split below (round-robin).
OTHER_TYPES = ['restaurant', 'caterer', 'commissary_cook']
HOME_TYPE = 'home_kitchen_permitted'


def fail(slug, reason):
    sys.stderr.write('sample_business_type: ' + str(slug) + ': ' + reason + '\n')
    sys.exit(1)


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def main():
    with open(KITCHENS, 'rb') as fh:
        raw = fh.read()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    trailing = raw.endswith(newline.encode('ascii'))
    data = json.loads(raw.decode('utf-8'))
    kitchens = data.get('kitchens', [])

    samples = [k for k in kitchens if isinstance(k, dict) and k.get('sample') is True]
    n = len(samples)
    n_home = int(round(0.70 * n))
    n_other = n - n_home

    by_type = sorted((k['slug'] for k in samples), key=lambda s: sha('business_type:' + s))
    business_type = {}
    for i, slug in enumerate(by_type):
        if i < n_home:
            business_type[slug] = HOME_TYPE
        else:
            business_type[slug] = OTHER_TYPES[(i - n_home) % len(OTHER_TYPES)]

    # Check: every sample got a valid, known type.
    counts = {HOME_TYPE: 0, 'restaurant': 0, 'caterer': 0, 'commissary_cook': 0}
    for slug, bt in business_type.items():
        if bt not in counts:
            fail(slug, 'unknown business_type ' + repr(bt))
        counts[bt] += 1
    if counts[HOME_TYPE] != n_home:
        fail('samples', 'home_kitchen_permitted count %d does not match %d' % (counts[HOME_TYPE], n_home))
    if sum(counts.values()) != n:
        fail('samples', 'business_type assigned to %d of %d samples' % (sum(counts.values()), n))

    # business_type goes directly after "sample"; every other key keeps its
    # place and value. Kitchens that aren't samples are not touched.
    rebuilt = []
    for k in kitchens:
        if not (isinstance(k, dict) and k.get('sample') is True):
            rebuilt.append(k)
            continue
        bt = business_type[k['slug']]
        out = {}
        for key, value in k.items():
            if key == 'business_type':
                continue
            out[key] = value
            if key == 'sample':
                out['business_type'] = bt
        rebuilt.append(out)
    data['kitchens'] = rebuilt

    text = json.dumps(data, indent=2, ensure_ascii=False)
    if newline != '\n':
        text = text.replace('\n', newline)
    if trailing:
        text += newline
    with open(KITCHENS, 'wb') as fh:
        fh.write(text.encode('utf-8'))
    print('sample_business_type: ' + str(counts[HOME_TYPE]) + ' home_kitchen_permitted, '
          + str(counts['restaurant']) + ' restaurant, ' + str(counts['caterer']) + ' caterer, '
          + str(counts['commissary_cook']) + ' commissary_cook')


if __name__ == '__main__':
    main()
