"""Check the *live* data/kitchens.json (and data/dishes.json) really loads.

    python tools/check_data_live.py --online

Every other integrity risk in this repo is caught before a commit ships
(check_listings.py, check_diet.py, check_ship.py's own checks). A bad
deploy of data/kitchens.json itself -- a hand-edit on GitHub that leaves
invalid JSON, or turns "kitchens" into something that isn't a list -- is
the one class of failure nothing catches automatically after the fact:
there's no analytics on this site (tracker-free, by design), so a broken
file in production could sit there until a household emails in "the site
shows nothing." app.js already degrades gracefully when this happens (see
loadData() -- a parse failure is caught, the list shows its calm "can't
load kitchens right now" state with a Retry button, nothing crashes); this
script exists to catch the bad deploy itself, right after it ships, not to
change that behaviour.

Run it by hand after a deploy (see README.md, "Before you ship"). Never
run it from check_ship.py or any other pre-commit check: it needs the live
network, which (per the handoff notes) isn't available in most build
sessions, and a commit should never be blocked by a fetch of the site it
just built.

What it checks, for each of https://tiffinfinder.ca/data/kitchens.json and
https://tiffinfinder.ca/data/dishes.json:
 1. The URL answers (a connection or timeout failure fails loudly).
 2. The response body is valid JSON.
 3. kitchens.json: json['kitchens'] is a list (matches the same
    Array.isArray(json.kitchens) check loadData() makes in app.js), and
    every entry is a JSON object with a 'slug'.
 4. dishes.json: the file has the shape the glossary expects (a list under
    a known key), so a broken glossary deploy is caught the same way.

Exit code: 0 if both files fetch and parse cleanly, 1 otherwise. Prints one
PASS/FAIL line per file plus a short reason. Standard library only.
"""
from __future__ import print_function

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request

TIMEOUT_SECONDS = 10
USER_AGENT = 'TiffinFinder-DataLiveCheck/1.0 (+https://tiffinfinder.ca)'

KITCHENS_URL = 'https://tiffinfinder.ca/data/kitchens.json'
DISHES_URL = 'https://tiffinfinder.ca/data/dishes.json'


def _fetch(url):
    """Returns (ok, body_text_or_None, detail). Never raises."""
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            code = resp.getcode()
            body = resp.read().decode('utf-8')
            if code != 200:
                return False, None, 'HTTP %d' % code
            return True, body, 'HTTP %d' % code
    except urllib.error.HTTPError as e:
        return False, None, 'HTTP %d' % e.code
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, ssl.SSLCertVerificationError):
            # Same known limitation check_links.py works around: this
            # machine's Python has no local CA bundle. Retry unverified
            # just to tell a real outage apart from a local TLS gap.
            try:
                with urllib.request.urlopen(
                    req, timeout=TIMEOUT_SECONDS,
                    context=ssl._create_unverified_context()
                ) as resp:
                    code = resp.getcode()
                    body = resp.read().decode('utf-8')
                    if code != 200:
                        return False, None, 'HTTP %d (TLS cert unverified on this machine)' % code
                    return True, body, 'HTTP %d (TLS cert unverified on this machine)' % code
            except Exception as e2:  # noqa: BLE001
                return False, None, 'unreachable even unverified: %s' % e2
        return False, None, 'unreachable: %s' % reason
    except Exception as e:  # noqa: BLE001
        return False, None, 'error: %s' % e


def check_kitchens(url):
    ok, body, detail = _fetch(url)
    if not ok:
        return False, 'fetch failed (%s)' % detail
    try:
        data = json.loads(body)
    except ValueError as e:
        return False, 'invalid JSON: %s' % e
    if not isinstance(data, dict):
        return False, 'top level is not a JSON object'
    kitchens = data.get('kitchens')
    if not isinstance(kitchens, list):
        return False, '"kitchens" is not a list (Array.isArray(json.kitchens) would be false in app.js)'
    if not kitchens:
        return False, '"kitchens" is an empty list'
    bad = [i for i, k in enumerate(kitchens) if not isinstance(k, dict) or not k.get('slug')]
    if bad:
        return False, '%d of %d entries are not objects with a "slug" (index %s)' % (len(bad), len(kitchens), bad[0])
    return True, '%d kitchen(s), valid JSON' % len(kitchens)


def check_dishes(url):
    ok, body, detail = _fetch(url)
    if not ok:
        return False, 'fetch failed (%s)' % detail
    try:
        data = json.loads(body)
    except ValueError as e:
        return False, 'invalid JSON: %s' % e
    if not isinstance(data, dict):
        return False, 'top level is not a JSON object'
    dishes = data.get('dishes')
    if not isinstance(dishes, list):
        return False, '"dishes" is not a list'
    return True, '%d dish entries, valid JSON' % len(dishes)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--online', action='store_true', required=True,
                         help='required flag: this script always fetches the live site, so it never runs by accident')
    args = parser.parse_args()
    if not args.online:  # pragma: no cover -- argparse already enforces this
        parser.error('pass --online (this script only ever runs online)')

    checks = [
        ('kitchens.json', KITCHENS_URL, check_kitchens),
        ('dishes.json', DISHES_URL, check_dishes),
    ]
    failures = 0
    for name, url, fn in checks:
        ok, detail = fn(url)
        print(('PASS' if ok else 'FAIL') + '  ' + name + ': ' + detail + '  (' + url + ')')
        if not ok:
            failures += 1

    print('')
    if failures:
        print('%d of %d live data file(s) failed -- fix and redeploy, or check the CDN/DNS.' % (failures, len(checks)))
    else:
        print('Both live data files fetch and parse cleanly.')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
