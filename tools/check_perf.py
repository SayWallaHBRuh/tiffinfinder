"""Performance budget check for Tiffin Finder.

  python tools/check_perf.py            offline (default): sums on-disk
                                         byte sizes for the first-load
                                         same-origin assets of index.html
                                         (the list/browse view) and of a
                                         kitchen page (index.html plus the
                                         dish glossary it fetches once a
                                         kitchen is open -- both routes are
                                         the same physical index.html, this
                                         is a single-page app, see
                                         README.md "Addresses the app
                                         understands"), against the budgets
                                         in tools/budgets.json. No network
                                         access. Exits non-zero if any
                                         budget is exceeded.

  python tools/check_perf.py --online   the offline checks, PLUS: fetches
                                         the Google Fonts stylesheet
                                         index.html links to and every
                                         woff2 file it references, and
                                         sums their Content-Length against
                                         fonts_transferred_kib. Font size
                                         can only be measured this way --
                                         Google Fonts serves woff2, not a
                                         file this repo holds -- so, like
                                         check_links.py --online, this part
                                         never fails the build by itself
                                         (a network hiccup shouldn't block
                                         a commit); it only prints a report.

Budgets are held in tools/budgets.json, in the same KiB-per-resource-type
shape Lighthouse's own budget.json uses, so the numbers are anchored to an
existing standard rather than invented here. gzip sizes are measured and
printed for every file (GitHub Pages serves pre-compressed automatically),
but only the raw (uncompressed, on-disk) size is budgeted -- that is the
number that only ever gets bigger when someone adds code, independent of
how well it happens to compress today.

Standard library only. Deterministic offline; the --online part is best
effort and network-dependent, matching check_links.py's existing pattern.
"""
from __future__ import print_function

import gzip
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIB = 1024

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print('FAIL: ' + msg)


def ok(msg):
    print('ok: ' + msg)


def note(msg):
    print('note: ' + msg)


def read_bytes(path):
    with open(path, 'rb') as fh:
        return fh.read()


def gzip_size(data):
    buf = io.BytesIO()
    # mtime=0 keeps this deterministic (no timestamp in the gzip header).
    with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=9, mtime=0) as gz:
        gz.write(data)
    return len(buf.getvalue())


def load_budgets():
    path = os.path.join(ROOT, 'tools', 'budgets.json')
    if not os.path.isfile(path):
        fail('tools/budgets.json not found')
        return {}
    with open(path, 'rb') as fh:
        return json.loads(fh.read().decode('utf-8'))


def fmt_kib(n):
    return '%.1f KiB' % (n / float(KIB))


def size_report(path):
    """(raw_bytes, gzip_bytes) for one file, or (None, None) if missing."""
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        return None, None
    data = read_bytes(full)
    return len(data), gzip_size(data)


def report_file(label, path):
    raw, gz = size_report(path)
    if raw is None:
        fail('%s: %s not found' % (label, path))
        return 0
    print('  %-28s %10s raw  %10s gzip  (%s)' % (label, fmt_kib(raw), fmt_kib(gz), path))
    return raw


# ---------------------------------------------------------------------------
# Component budgets: app.js and styles.css on their own, and every
# top-level HTML page on its own.
# ---------------------------------------------------------------------------
def check_component_budgets(budgets):
    print('\n-- Component sizes --')
    js_raw, js_gz = size_report('app.js')
    if js_raw is None:
        fail('app.js not found')
    else:
        print('  %-28s %10s raw  %10s gzip' % ('app.js', fmt_kib(js_raw), fmt_kib(js_gz)))
        budget = budgets.get('js_raw_kib', 300) * KIB
        if js_raw > budget:
            fail('app.js is %s, over the %s JS budget' % (fmt_kib(js_raw), fmt_kib(budget)))
        else:
            ok('app.js (%s) is within the %s JS budget' % (fmt_kib(js_raw), fmt_kib(budget)))

    css_raw, css_gz = size_report('styles.css')
    if css_raw is None:
        fail('styles.css not found')
    else:
        print('  %-28s %10s raw  %10s gzip' % ('styles.css', fmt_kib(css_raw), fmt_kib(css_gz)))
        budget = budgets.get('css_raw_kib', 170) * KIB
        if css_raw > budget:
            fail('styles.css is %s, over the %s CSS budget' % (fmt_kib(css_raw), fmt_kib(budget)))
        else:
            ok('styles.css (%s) is within the %s CSS budget' % (fmt_kib(css_raw), fmt_kib(budget)))

    print('\n-- HTML pages --')
    html_budget = budgets.get('html_raw_kib', 60) * KIB
    html_files = sorted(
        f for f in os.listdir(ROOT)
        if f.endswith('.html') and os.path.isfile(os.path.join(ROOT, f))
    )
    over = []
    for f in html_files:
        raw, gz = size_report(f)
        print('  %-28s %10s raw  %10s gzip' % (f, fmt_kib(raw), fmt_kib(gz)))
        if raw > html_budget:
            over.append('%s is %s, over the %s HTML budget' % (f, fmt_kib(raw), fmt_kib(html_budget)))
    if over:
        for o in over:
            fail(o)
    else:
        ok('every HTML page (%d) is within the %s per-page HTML budget' % (len(html_files), fmt_kib(html_budget)))


# ---------------------------------------------------------------------------
# First-load bundles: the same-origin files a fresh visit downloads before
# it can show something useful. Both routes are index.html (client-side
# routing -- see README.md "Addresses the app understands"), so the shared
# core is identical; a kitchen page additionally fetches data/dishes.json,
# the dish glossary used to link menu items (README.md "Data").
# ---------------------------------------------------------------------------
CORE_FILES = [
    ('index.html', 'index.html'),
    ('early.js', 'early.js'),
    ('styles.css', 'styles.css'),
    ('app.js', 'app.js'),
    ('favicon.svg', 'icons/favicon.svg'),
    ('mascot.svg', 'icons/mascot.svg'),
    ('kitchens.json', 'data/kitchens.json'),
]

KITCHEN_EXTRA = [
    ('dishes.json', 'data/dishes.json'),
]


def check_first_load(budgets):
    budget = budgets.get('first_load_raw_kib', 550) * KIB

    print('\n-- First load: index.html (list view) --')
    total = 0
    for label, path in CORE_FILES:
        total += report_file(label, path)
    print('  %-28s %10s raw' % ('TOTAL', fmt_kib(total)))
    if total > budget:
        fail('index.html first load is %s, over the %s budget' % (fmt_kib(total), fmt_kib(budget)))
    else:
        ok('index.html first load (%s) is within the %s budget' % (fmt_kib(total), fmt_kib(budget)))

    print('\n-- First load: a kitchen page (index.html?k=<slug>) --')
    k_total = total
    for label, path in KITCHEN_EXTRA:
        k_total += report_file(label, path)
    print('  %-28s %10s raw' % ('TOTAL', fmt_kib(k_total)))
    if k_total > budget:
        fail('kitchen page first load is %s, over the %s budget' % (fmt_kib(k_total), fmt_kib(budget)))
    else:
        ok('kitchen page first load (%s) is within the %s budget' % (fmt_kib(k_total), fmt_kib(budget)))

    print('\nnote: fonts (Google Fonts, 3 variable families) are not counted above --')
    print('note: they can only be measured over the network. Run with --online to check them,')
    print('note: or see the budget note in tools/budgets.json.')


# ---------------------------------------------------------------------------
# --online: Google Fonts transfer size
# ---------------------------------------------------------------------------
def check_fonts_online(budgets):
    import urllib.error
    import urllib.request

    print('\n-- Fonts (--online): Google Fonts transfer size --')
    path = os.path.join(ROOT, 'index.html')
    text = read_bytes(path).decode('utf-8')
    m = re.search(r'https://fonts\.googleapis\.com/css2\?[^"\']+', text)
    if not m:
        note('no Google Fonts stylesheet link found in index.html -- skipping')
        return
    css_url = m.group(0)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
    try:
        req = urllib.request.Request(css_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            css_text = resp.read().decode('utf-8', 'replace')
    except (urllib.error.URLError, OSError) as e:
        note('could not fetch Google Fonts CSS (%s) -- skipping (this never fails the build)' % e)
        return

    font_urls = sorted(set(re.findall(r'https://fonts\.gstatic\.com/[^)\s]+\.woff2', css_text)))
    if not font_urls:
        note('Google Fonts CSS fetched but no woff2 URLs found in it -- skipping')
        return

    total = 0
    missing = 0
    for url in font_urls:
        try:
            req = urllib.request.Request(url, method='HEAD', headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                length = resp.headers.get('Content-Length')
                if length:
                    total += int(length)
                else:
                    missing += 1
        except (urllib.error.URLError, OSError) as e:
            missing += 1
            note('could not fetch %s (%s)' % (url, e))

    print('  %d woff2 file(s), %s known transferred size (%d without a Content-Length)'
          % (len(font_urls), fmt_kib(total), missing))
    budget = budgets.get('fonts_transferred_kib', 150) * KIB
    if total > budget:
        note('Google Fonts transfer (%s) is over the %s budget -- consider dropping a font '
             'family or subset (this does not fail the build; see backlog-4.md item 4)' % (fmt_kib(total), fmt_kib(budget)))
    else:
        ok('Google Fonts transfer (%s) is within the %s budget' % (fmt_kib(total), fmt_kib(budget)))


def main():
    online = '--online' in sys.argv[1:]
    print('== Tiffin Finder performance budget check ==')
    budgets = load_budgets()
    check_component_budgets(budgets)
    check_first_load(budgets)
    if online:
        check_fonts_online(budgets)
    else:
        print('\nnote: run with --online to also measure Google Fonts transfer size (network required).')

    print('')
    if FAILURES:
        print('%d budget(s) exceeded:' % len(FAILURES))
        for f in FAILURES:
            print(' - ' + f)
        return 1
    print('All budgets passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
