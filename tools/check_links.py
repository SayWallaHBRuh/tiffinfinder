"""Link checker for Tiffin Finder.

Two modes:

  python tools/check_links.py            offline (default): every local
                                          href/src in every HTML page
                                          resolves to a real file on disk.
                                          No network access. This is the
                                          same check `check_ship.py` already
                                          runs inline (its check #6) --
                                          `offline_broken_links()` here is
                                          the shared implementation, so
                                          there is exactly one copy of the
                                          logic, not two.

  python tools/check_links.py --online   offline check, PLUS: fetches every
                                          *external* https:// URL found in
                                          every HTML page, every real
                                          kitchen's `permit.source_url` in
                                          data/kitchens.json, and every
                                          source link in the permit guide
                                          pages (permitted.html, guide.html),
                                          and reports any that don't answer
                                          with a 200. Short timeout per URL,
                                          network access required.

NEVER run --online as part of `check_ship.py` or any other pre-commit
check -- it needs the network and can be slow or flaky, and a commit
should never be blocked by a third party's server being briefly down.
Run it by hand (or on a schedule) instead, and read the report.

Exit code: 0 if nothing is broken, 1 otherwise (offline mode only fails
the build; --online always exits 0 unless combined with --strict, so a
routine external-site hiccup doesn't block anything by itself -- read the
printed report and use judgement).
"""
from __future__ import print_function

import argparse
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HTML_FILES = sorted(
    f for f in os.listdir(ROOT)
    if f.endswith('.html') and os.path.isfile(os.path.join(ROOT, f))
)

# Pages whose own https:// references count as the "permit guide source
# lists" the task calls out by name.
GUIDE_PAGES = ['permitted.html', 'guide.html']

TIMEOUT_SECONDS = 8
USER_AGENT = 'TiffinFinder-LinkCheck/1.0 (+https://tiffinfinder.ca)'


def read_text(path):
    with open(path, 'rb') as fh:
        return fh.read().decode('utf-8')


# ---------------------------------------------------------------------------
# Offline: every local href/src resolves to a real file.
# ---------------------------------------------------------------------------
def offline_broken_links():
    """Returns a list of human-readable strings, one per broken local
    href/src across every HTML page. Empty list means everything resolves.
    This is the exact same rule check_ship.py's check #6 has always run;
    it now lives here once, and check_ship.py calls this function instead
    of keeping its own copy."""
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
    return broken, checked


# ---------------------------------------------------------------------------
# Online: collect external URLs to check.
# ---------------------------------------------------------------------------
def external_urls_in_pages():
    """{url: set(source description)} for every https:// URL that appears
    as an href/src in any HTML page. Skips `rel="preconnect"` links (a
    bare origin like `https://fonts.gstatic.com` with no path, used only
    as a DNS/TCP hint -- it has nothing at `/` to fetch and a 404 there is
    normal, not a broken link)."""
    urls = {}
    tag_re = re.compile(r'<(?:a|link)\b[^>]*>', re.I)
    for f in HTML_FILES:
        path = os.path.join(ROOT, f)
        text = read_text(path)
        for tag in tag_re.finditer(text):
            tag_text = tag.group(0)
            if re.search(r'\brel\s*=\s*"[^"]*\bpreconnect\b[^"]*"', tag_text, re.I):
                continue
            m = re.search(r'\b(?:href|src)="(https://[^"]*)"', tag_text)
            if m:
                urls.setdefault(m.group(1), set()).add(f)
    return urls


def source_urls_in_kitchens_json():
    """{url: set('data/kitchens.json: <slug>')} for every real (non-sample)
    kitchen's permit.source_url."""
    path = os.path.join(ROOT, 'data', 'kitchens.json')
    urls = {}
    if not os.path.isfile(path):
        return urls
    with open(path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    for k in data.get('kitchens', []):
        if k.get('sample'):
            continue
        su = (k.get('permit') or {}).get('source_url')
        if su:
            urls.setdefault(su, set()).add(
                'data/kitchens.json: ' + k.get('slug', '?')
            )
    return urls


def guide_source_urls():
    """{url: set(page)} restricted to the two permit-guide pages, called
    out separately since they're the site's own "how permits work" source
    list, not just incidental links. Same preconnect exclusion as
    external_urls_in_pages()."""
    urls = {}
    tag_re = re.compile(r'<(?:a|link)\b[^>]*>', re.I)
    for f in GUIDE_PAGES:
        path = os.path.join(ROOT, f)
        if not os.path.isfile(path):
            continue
        text = read_text(path)
        for tag in tag_re.finditer(text):
            tag_text = tag.group(0)
            if re.search(r'\brel\s*=\s*"[^"]*\bpreconnect\b[^"]*"', tag_text, re.I):
                continue
            m = re.search(r'\b(?:href|src)="(https://[^"]*)"', tag_text)
            if m:
                urls.setdefault(m.group(1), set()).add(f)
    return urls


def merge(*dicts):
    out = {}
    for d in dicts:
        for url, sources in d.items():
            out.setdefault(url, set()).update(sources)
    return out


def _open(url, method, context=None):
    req = urllib.request.Request(url, method=method, headers={'User-Agent': USER_AGENT})
    return urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS, context=context)


def check_online(url):
    """Returns (ok, detail). ok is True for any 2xx/3xx response (a
    redirect that resolves is fine -- we're checking the link isn't dead,
    not that it's canonical). detail is a short status string."""
    try:
        with _open(url, 'HEAD') as resp:
            code = resp.getcode()
            return (200 <= code < 400), str(code)
    except urllib.error.HTTPError as e:
        if e.code in (405, 403):
            # Some servers reject HEAD; retry with GET before giving up.
            try:
                with _open(url, 'GET') as resp2:
                    code2 = resp2.getcode()
                    return (200 <= code2 < 400), str(code2)
            except Exception as e2:  # noqa: BLE001
                return False, 'HEAD %s, GET retry failed: %s' % (e.code, e2)
        return False, 'HTTP %d' % e.code
    except urllib.error.URLError as e:
        reason = e.reason
        if isinstance(reason, ssl.SSLCertVerificationError):
            # This machine's Python has no local CA bundle to verify TLS
            # certs with (a known Windows/this-runtime limitation, not a
            # site problem) -- retry once without verification just to
            # confirm the URL itself is reachable, and say so plainly
            # rather than reporting a real site as broken.
            try:
                with _open(url, 'HEAD', context=ssl._create_unverified_context()) as resp:
                    code = resp.getcode()
                    ok = 200 <= code < 400
                    return ok, ('%s (TLS cert unverified on this machine)' % code if ok
                                 else 'HTTP %s (TLS cert unverified on this machine)' % code)
            except Exception as e2:  # noqa: BLE001
                return False, 'unreachable even unverified: %s' % e2
        return False, 'unreachable: %s' % reason
    except Exception as e:  # noqa: BLE001
        return False, 'error: %s' % e


def run_online():
    all_urls = merge(
        external_urls_in_pages(),
        source_urls_in_kitchens_json(),
        guide_source_urls(),
    )
    print('Checking %d external URL(s) online (timeout %ds each) ...\n'
          % (len(all_urls), TIMEOUT_SECONDS))
    bad = []
    for url in sorted(all_urls):
        ok, detail = check_online(url)
        sources = ', '.join(sorted(all_urls[url]))
        if ok:
            print('ok   %-6s %s  (%s)' % (detail, url, sources))
        else:
            print('FAIL %-6s %s  (%s)' % (detail, url, sources))
            bad.append((url, detail, sources))
    print('')
    if bad:
        print('%d of %d external URL(s) did not answer with a 200/2xx/3xx:'
              % (len(bad), len(all_urls)))
        for url, detail, sources in bad:
            print(' - %s [%s] (%s)' % (url, detail, sources))
    else:
        print('All %d external URL(s) answered fine.' % len(all_urls))
    return bad


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--online', action='store_true',
                         help='also fetch every external URL and report non-200s')
    args = parser.parse_args()

    broken, checked = offline_broken_links()
    if broken:
        print('%d broken local link(s) (of %d checked):' % (len(broken), checked))
        for b in broken:
            print(' - ' + b)
    else:
        print('ok: every local href/src resolves to a real file (%d checked)' % checked)

    exit_code = 1 if broken else 0

    if args.online:
        print('')
        run_online()
        # Online failures are reported but don't fail the build by
        # themselves -- a third party's site being briefly down is not
        # this repo's bug. Local broken links still fail it.

    return exit_code


if __name__ == '__main__':
    sys.exit(main())
