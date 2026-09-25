"""Pre-commit ship check for Tiffin Finder.

Runs every check we do by hand before shipping a change, in one command:

    python tools/check_ship.py

Checks (each prints its own PASS/FAIL lines):

 1. CNAME still says exactly "tiffinfinder.ca", and is byte-identical to the
    copy on origin/main (never modify or delete it -- rule 5).
 2. None of the banned phrases ("AHS approved", "verified by",
    "Permit verified") appear anywhere in *.html, app.js, early.js or
    data/*.json, even quoted or negated (rule 2).
 3. No "unsafe-inline" anywhere (CSP must stay strict).
 4. sw.js VERSION matches every ?v=<version> on every HTML page (rule 9).
 5. Every file sw.js precaches (the SHELL list) exists on disk.
 6. Every local href="..."/src="..." in every HTML page resolves to a real
    file (external https:// links, mailto:, tel:, #fragments and the
    manifest's own entries are skipped).
 7. Every inline <script> block on every page (the <base> setters in
    404.html/offline.html, and the speculationrules/ld+json blocks added in
    Round 14) has its sha256 hash present in that page's own CSP script-src,
    and every hash actually matches its block's exact bytes (rule 6/9: no
    unhashed inline script can ever silently start working, or silently
    break).
 8. Exactly one <h1> per standalone page.
 9. No innerHTML/eval/inline "on*" handlers/inline style= attributes in any
    tracked page or app.js/early.js (DOM safety -- rule 6).
10. No obvious hardcoded secret (API key / token-looking string) in the
    diff-able source files.
11. Runs tools/check_diet.py.
12. Runs tools/check_listings.py (real-kitchen listing data checks).

Exits 0 if everything passes, 1 otherwise. Standard library only, no
network access, deterministic.
"""
from __future__ import print_function

import base64
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML_FILES = sorted(
    f for f in os.listdir(ROOT)
    if f.endswith('.html') and os.path.isfile(os.path.join(ROOT, f))
)

STANDALONE_PAGES = [
    f for f in HTML_FILES if f not in ('404.html', 'offline.html')
] + ['404.html', 'offline.html']  # every page is "standalone" here (one h1)

BANNED_PHRASES = ('AHS approved', 'verified by', 'Permit verified')

SECRET_PATTERNS = [
    re.compile(r'AKIA[0-9A-Z]{16}'),                                   # AWS
    re.compile(r'sk-[A-Za-z0-9]{20,}'),                                 # OpenAI/Anthropic-style
    re.compile(r'AIza[0-9A-Za-z\-_]{35}'),                              # Google API key
    re.compile(r'ghp_[A-Za-z0-9]{36}'),                                 # GitHub token
    re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'),                        # Slack token
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    re.compile(r'(?i)\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["\'][A-Za-z0-9/+_\-]{16,}["\']'),
]

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print('FAIL: ' + msg)


def ok(msg):
    print('ok: ' + msg)


def read_text(path):
    with open(path, 'rb') as fh:
        return fh.read().decode('utf-8')


def read_bytes(path):
    with open(path, 'rb') as fh:
        return fh.read()


def run(cmd):
    try:
        out = subprocess.check_output(cmd, cwd=ROOT, stderr=subprocess.STDOUT)
        return 0, out.decode('utf-8', 'replace')
    except subprocess.CalledProcessError as e:
        return e.returncode, e.output.decode('utf-8', 'replace')
    except OSError as e:
        return 1, str(e)


# ---------------------------------------------------------------------------
# 1. CNAME
# ---------------------------------------------------------------------------
def check_cname():
    path = os.path.join(ROOT, 'CNAME')
    if not os.path.isfile(path):
        fail('CNAME: file is missing')
        return
    content = read_text(path).strip()
    if content != 'tiffinfinder.ca':
        fail('CNAME: content is %r, expected "tiffinfinder.ca"' % content)
    else:
        ok('CNAME content is "tiffinfinder.ca"')

    code, out = run(['git', 'diff', '--quiet', 'origin/main', '--', 'CNAME'])
    if code == 0:
        ok('CNAME unchanged vs origin/main')
    elif code == 1:
        fail('CNAME differs from origin/main:\n' + out)
    else:
        # origin/main not reachable (offline / no remote configured yet) --
        # don't block shipping on that, just say so.
        print('warn: could not diff CNAME against origin/main (%s)' % out.strip())


# ---------------------------------------------------------------------------
# 2. Banned phrases
# ---------------------------------------------------------------------------
def scan_targets():
    targets = []
    for f in HTML_FILES:
        targets.append(os.path.join(ROOT, f))
    for f in ('app.js', 'early.js'):
        p = os.path.join(ROOT, f)
        if os.path.isfile(p):
            targets.append(p)
    data_dir = os.path.join(ROOT, 'data')
    if os.path.isdir(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith('.json'):
                targets.append(os.path.join(data_dir, f))
    return targets


def check_banned_phrases():
    hits = []
    for path in scan_targets():
        text = read_text(path)
        low = text.lower()
        for phrase in BANNED_PHRASES:
            if phrase.lower() in low:
                # find line numbers
                for i, line in enumerate(text.splitlines(), 1):
                    if phrase.lower() in line.lower():
                        hits.append('%s:%d: %r' % (os.path.relpath(path, ROOT), i, phrase))
    if hits:
        for h in hits:
            fail('banned phrase found - ' + h)
    else:
        ok('no banned phrases (AHS approved / verified by / Permit verified)')


# ---------------------------------------------------------------------------
# 3. unsafe-inline
# ---------------------------------------------------------------------------
def check_unsafe_inline():
    hits = []
    for path in scan_targets():
        text = read_text(path)
        if 'unsafe-inline' in text:
            hits.append(os.path.relpath(path, ROOT))
    if hits:
        for h in hits:
            fail('"unsafe-inline" found in ' + h)
    else:
        ok('no "unsafe-inline" anywhere')


# ---------------------------------------------------------------------------
# 4. VERSION / ?v= match
# ---------------------------------------------------------------------------
def get_sw_version():
    sw_path = os.path.join(ROOT, 'sw.js')
    text = read_text(sw_path)
    m = re.search(r"VERSION\s*=\s*'([^']+)'", text)
    if not m:
        fail('sw.js: could not find VERSION assignment')
        return None
    return m.group(1)


def check_versions(version):
    if version is None:
        return
    mismatches = []
    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)
        vs = set(re.findall(r'\?v=([A-Za-z0-9.\-]+)', text))
        for v in vs:
            if v != version:
                mismatches.append('%s has ?v=%s, expected %s' % (f, v, version))
        if not vs and ('styles.css' in text or 'app.js' in text or 'early.js' in text):
            mismatches.append('%s: no ?v= found on styles.css/app.js/early.js' % f)
    if mismatches:
        for m in mismatches:
            fail('version mismatch - ' + m)
    else:
        ok('sw.js VERSION (%s) matches every ?v= on every page' % version)


# ---------------------------------------------------------------------------
# 5. precache list exists on disk
# ---------------------------------------------------------------------------
def check_precache_files():
    sw_path = os.path.join(ROOT, 'sw.js')
    text = read_text(sw_path)
    m = re.search(r'var\s+SHELL\s*=\s*\[(.*?)\];', text, re.S)
    if not m:
        fail('sw.js: could not find SHELL precache list')
        return
    entries = re.findall(r"'([^']+)'", m.group(1))
    missing = []
    for entry in entries:
        rel = entry[2:] if entry.startswith('./') else entry
        rel = rel.split('?', 1)[0]
        if rel == '' or rel == '/':
            continue
        if not os.path.isfile(os.path.join(ROOT, rel)):
            missing.append(entry)
    if missing:
        for m2 in missing:
            fail('sw.js precache entry missing on disk: ' + m2)
    else:
        ok('every sw.js precache entry (%d files) exists on disk' % len(entries))


# ---------------------------------------------------------------------------
# 6. local href/src resolve
# ---------------------------------------------------------------------------
def check_local_links():
    broken = []
    checked = 0
    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)
        for val in re.findall(r'\b(?:href|src)="([^"]*)"', text):
            if val.startswith(('http://', 'https://', 'mailto:', 'tel:', '#', 'data:')):
                continue
            if val.startswith('./?') or val == './' or val.startswith('.?'):
                continue  # in-app links to index with query params
            clean = val.split('#', 1)[0].split('?', 1)[0]
            if clean in ('', '.', './'):
                continue
            rel = clean[2:] if clean.startswith('./') else clean.lstrip('/')
            checked += 1
            if not os.path.isfile(os.path.join(ROOT, rel)):
                broken.append('%s: %s -> %s' % (f, val, rel))
    if broken:
        for b in broken:
            fail('broken local link - ' + b)
    else:
        ok('every local href/src resolves to a real file (%d checked)' % checked)


# ---------------------------------------------------------------------------
# 7. CSP sha256 hashes for every inline <script> block (any type: none,
#    speculationrules, application/ld+json, ...), on every page.
# ---------------------------------------------------------------------------
def check_csp_hashes():
    # Matches <script>, <script type="...">, with or without other
    # attributes, but never a <script src="..."> (which carries no inline
    # body to hash and isn't covered by a hash source anyway).
    script_re = re.compile(
        r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.S)

    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)

        blocks = [m.group(2) for m in script_re.finditer(text)]
        if not blocks:
            continue

        csp_m = re.search(r'Content-Security-Policy" content="([^"]+)"', text)
        if not csp_m:
            fail('%s: has inline <script> block(s) but no CSP meta tag' % f)
            continue
        csp = csp_m.group(1)
        script_src_m = re.search(r'script-src([^;]*)', csp)
        script_src_value = script_src_m.group(1) if script_src_m else ''
        declared_hashes = set(re.findall(r"'sha256-([^']+)'", script_src_value))

        for block in blocks:
            digest = hashlib.sha256(block.encode('utf-8')).digest()
            actual = base64.b64encode(digest).decode('ascii')
            if actual not in declared_hashes:
                fail('%s: inline <script> sha256 hash not in CSP script-src '
                     '(actual is sha256-%s) - %s'
                     % (f, actual, block.strip()[:60].replace('\n', ' ')))

        if all(
            (base64.b64encode(hashlib.sha256(b.encode('utf-8')).digest()).decode('ascii'))
            in declared_hashes
            for b in blocks
        ):
            ok('%s: every inline <script> block (%d) is hash-allowed by its CSP'
               % (f, len(blocks)))


# ---------------------------------------------------------------------------
# 8. one <h1> per page
# ---------------------------------------------------------------------------
def check_h1_counts():
    bad = []
    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)
        count = len(re.findall(r'<h1[\s>]', text))
        if count != 1:
            bad.append('%s has %d <h1> elements' % (f, count))
    if bad:
        for b in bad:
            fail(b)
    else:
        ok('exactly one <h1> per page (%d pages)' % len(HTML_FILES))


# ---------------------------------------------------------------------------
# 9. DOM safety: no innerHTML / eval / inline on*= / style=
# ---------------------------------------------------------------------------
def check_dom_safety():
    hits = []
    js_files = [os.path.join(ROOT, f) for f in ('app.js', 'early.js')
                if os.path.isfile(os.path.join(ROOT, f))]
    for path in js_files:
        text = read_text(path)
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(r'\.innerHTML\s*=', line) or re.search(r'\beval\s*\(', line):
                hits.append('%s:%d: %s' % (os.path.basename(path), i, line.strip()[:80]))
    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(r'\son[a-z]+\s*=\s*"', line, re.I):
                hits.append('%s:%d: inline event handler - %s' % (f, i, line.strip()[:80]))
            if re.search(r'\sstyle\s*=\s*"', line, re.I):
                hits.append('%s:%d: inline style attribute - %s' % (f, i, line.strip()[:80]))
    if hits:
        for h in hits:
            fail('DOM safety - ' + h)
    else:
        ok('no innerHTML/eval/inline on*= handlers/inline style= attributes')


# ---------------------------------------------------------------------------
# 10. secret-looking strings
# ---------------------------------------------------------------------------
def check_secrets():
    hits = []
    for path in scan_targets():
        text = read_text(path)
        for pat in SECRET_PATTERNS:
            for m in pat.finditer(text):
                line_no = text.count('\n', 0, m.start()) + 1
                hits.append('%s:%d: matches %s' % (os.path.relpath(path, ROOT), line_no, pat.pattern[:40]))
    if hits:
        for h in hits:
            fail('possible secret - ' + h)
    else:
        ok('no secret-looking strings found')


# ---------------------------------------------------------------------------
# 11. check_diet.py
# ---------------------------------------------------------------------------
def check_diet():
    diet_path = os.path.join(ROOT, 'tools', 'check_diet.py')
    if not os.path.isfile(diet_path):
        fail('tools/check_diet.py not found')
        return
    code, out = run([sys.executable, diet_path])
    print(out.strip())
    if code != 0:
        fail('tools/check_diet.py exited %d' % code)
    else:
        ok('tools/check_diet.py passed')


# ---------------------------------------------------------------------------
# 12. check_listings.py
# ---------------------------------------------------------------------------
def check_listings():
    listings_path = os.path.join(ROOT, 'tools', 'check_listings.py')
    if not os.path.isfile(listings_path):
        fail('tools/check_listings.py not found')
        return
    code, out = run([sys.executable, listings_path])
    print(out.strip())
    if code != 0:
        fail('tools/check_listings.py exited %d' % code)
    else:
        ok('tools/check_listings.py passed')


def main():
    print('== Tiffin Finder ship check ==\n')
    check_cname()
    check_banned_phrases()
    check_unsafe_inline()
    version = get_sw_version()
    check_versions(version)
    check_precache_files()
    check_local_links()
    check_csp_hashes()
    check_h1_counts()
    check_dom_safety()
    check_secrets()
    check_diet()
    check_listings()

    print('')
    if FAILURES:
        print('%d check(s) FAILED:' % len(FAILURES))
        for f in FAILURES:
            print(' - ' + f)
        return 1
    print('All checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
