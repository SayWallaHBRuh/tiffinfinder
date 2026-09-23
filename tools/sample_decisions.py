"""Give the sample kitchens a made-up trial week and capacity.

Run from the tiffinfinder folder:

    python tools/sample_decisions.py

For every kitchen with "sample": true this writes two keys directly after
"price":

    "trial":    {"offered": true|false, "price": number|null, "note": string|null}
    "capacity": "open" | "waitlist" | "full"

Kitchens without "sample": true, and meta, are left exactly as they are.

About 60% of the samples are "open", 25% "waitlist" and the rest "full"
(14 / 6 / 4 for 24 samples). Half of all the samples offer a trial week
(12 of 24), never a "full" one. An offered trial costs 85% of the weekly
price (or five day prices when there is no weekly price), and some carry
the note "Five weekday tiffins, one trial week per household.".

Everything is picked with a fixed recipe (sha256 hashes of the slugs, no
randomness), so running this twice gives a byte-identical
data/kitchens.json. The file keeps its own newline style (LF or CRLF) and
its trailing-newline state. Standard library only.

It stops with an error, naming the kitchen, when any of the checks below
fail, and writes nothing in that case.
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS = os.path.join(ROOT, 'data', 'kitchens.json')
TRIAL_NOTE = 'Five weekday tiffins, one trial week per household.'


def fail(slug, reason):
    sys.stderr.write('sample_decisions: ' + str(slug) + ': ' + reason + '\n')
    sys.exit(1)


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def trial_price(k):
    price = k.get('price') or {}
    weekly = price.get('weekly')
    day = price.get('day')
    if is_number(weekly) and weekly > 0:
        return int(round(weekly * 0.85))
    if is_number(day) and day > 0:
        return int(day * 5)
    fail(k.get('slug', '?'), 'needs price.weekly or price.day for a trial price')
    return 0


def main():
    with open(KITCHENS, 'rb') as fh:
        raw = fh.read()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    trailing = raw.endswith(newline.encode('ascii'))
    data = json.loads(raw.decode('utf-8'))
    kitchens = data.get('kitchens', [])

    samples = [k for k in kitchens if isinstance(k, dict) and k.get('sample') is True]
    for k in samples:
        price = k.get('price')
        if not isinstance(price, dict) or not is_number(price.get('day')):
            fail(k.get('slug', '?'), 'price.day must be a number')

    n = len(samples)
    n_open = int(round(0.60 * n))
    n_wait = int(round(0.25 * n))
    n_full = n - n_open - n_wait
    n_trial = int(round(0.5 * n))

    by_capacity = sorted((k['slug'] for k in samples), key=lambda s: sha('capacity:' + s))
    capacity = {}
    for i, slug in enumerate(by_capacity):
        capacity[slug] = 'open' if i < n_open else ('waitlist' if i < n_open + n_wait else 'full')

    not_full = [k['slug'] for k in samples if capacity[k['slug']] != 'full']
    if len(not_full) < n_trial:
        fail('samples', 'only ' + str(len(not_full)) + ' kitchens are not full, ' + str(n_trial) + ' trials needed')
    offered = set(sorted(not_full, key=lambda s: sha('trial:' + s))[:n_trial])

    decisions = {}
    for k in samples:
        slug = k['slug']
        if slug in offered:
            note = TRIAL_NOTE if int(sha('note:' + slug)[:8], 16) % 2 == 0 else None
            trial = {'offered': True, 'price': trial_price(k), 'note': note}
        else:
            trial = {'offered': False, 'price': None, 'note': None}
        decisions[slug] = (trial, capacity[slug])

    # Checks before anything is written.
    counts = {'open': 0, 'waitlist': 0, 'full': 0}
    trials = 0
    for slug, (trial, cap) in decisions.items():
        counts[cap] += 1
        if trial['offered']:
            trials += 1
            if cap == 'full':
                fail(slug, 'a full kitchen must not offer a trial week')
            if not isinstance(trial['price'], int) or isinstance(trial['price'], bool) or trial['price'] <= 0:
                fail(slug, 'an offered trial needs a whole-dollar price above 0')
    if counts != {'open': n_open, 'waitlist': n_wait, 'full': n_full}:
        fail('samples', 'capacity counts ' + json.dumps(counts) + ' do not match ' + str(n_open) + ' / ' + str(n_wait) + ' / ' + str(n_full))
    if trials != n_trial:
        fail('samples', str(trials) + ' trial weeks offered, expected ' + str(n_trial))

    # trial and capacity go directly after price; every other key keeps its
    # place and value. Kitchens that aren't samples are not touched.
    rebuilt = []
    for k in kitchens:
        if not (isinstance(k, dict) and k.get('sample') is True):
            rebuilt.append(k)
            continue
        trial, cap = decisions[k['slug']]
        out = {}
        for key, value in k.items():
            if key in ('trial', 'capacity'):
                continue
            out[key] = value
            if key == 'price':
                out['trial'] = trial
                out['capacity'] = cap
        rebuilt.append(out)
    data['kitchens'] = rebuilt

    text = json.dumps(data, indent=2, ensure_ascii=False)
    if newline != '\n':
        text = text.replace('\n', newline)
    if trailing:
        text += newline
    with open(KITCHENS, 'wb') as fh:
        fh.write(text.encode('utf-8'))
    print('sample_decisions: ' + str(counts['open']) + ' open, ' + str(counts['waitlist']) + ' waitlist, '
          + str(counts['full']) + ' full; ' + str(trials) + ' offer a trial week')


if __name__ == '__main__':
    main()
