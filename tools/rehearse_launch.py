"""Flip-switch rehearsal for Tiffin Finder.

Proves the "turn the samples off" switch (see README.md, "Showing or hiding
the sample kitchens") works end to end, without ever touching the real
site or the real data file:

 1. Copies the whole site into a temp directory.
 2. In that copy only, edits `data/kitchens.json` so `meta.show_samples`
    is `false` (the real `data/kitchens.json` in this repo is never
    opened for writing).
 3. Serves that temp copy with Python's built-in `http.server` on a free
    localhost port.
 4. Uses headless Microsoft Edge, with a brand-new profile under
    `%LOCALAPPDATA%\\Temp\\edgeprof\\<random>` and
    `--force-prefers-reduced-motion` (so screenshots are stable), to
    screenshot:
      - the home page (`/`)
      - the map (`/?view=map`)
      - the Following view (`/?view=following`)
      - a former sample kitchen's own page (`/?k=<slug>`) -- proves the
        "This was a sample listing" launch-state page
      - `kitchens.html` (the kitchen-owner page, unaffected by the switch)
    into an output folder (default `C:\\tiffinfinder\\design\\launch-
    rehearsal\\`, in the PRIVATE handoff repo, not this site repo).
 5. Cleans up the temp site directory and the Edge profile, and stops the
    HTTP server, whatever happens (a screenshot failure doesn't leave junk
    behind).

Nothing here edits the real `data/kitchens.json`, and nothing here pushes
or commits anything -- it only writes image files into the output folder.

Usage:

    python tools/rehearse_launch.py [output_dir]

Requires Microsoft Edge to be installed. Standard library only otherwise.
"""
from __future__ import print_function

import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Default output lives in the PRIVATE handoff repo's design/ folder
# (C:\tiffinfinder\design\...), one level above this site repo
# (C:\tiffinfinder\site), not inside the public site repo -- these are
# working screenshots, not something to ship. Pass an argument to put
# them anywhere else.
DEFAULT_OUT = os.path.join(os.path.dirname(ROOT), 'design', 'launch-rehearsal')

# Files/dirs from the site root that must NOT be copied into the temp
# server root (keeps the copy small and avoids copying VCS internals or
# earlier rehearsal output back into itself).
SKIP_NAMES = {'.git', '__pycache__', '.DS_Store'}

EDGE_CANDIDATES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe'),
]


def find_edge():
    for c in EDGE_CANDIDATES:
        if os.path.isfile(c):
            return c
    found = shutil.which('msedge')
    if found:
        return found
    raise SystemExit('Could not find msedge.exe. Checked: ' + ', '.join(EDGE_CANDIDATES))


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def copy_site(dest):
    for name in os.listdir(ROOT):
        if name in SKIP_NAMES:
            continue
        src = os.path.join(ROOT, name)
        dst = os.path.join(dest, name)
        if os.path.isdir(src):
            shutil.copytree(
                src, dst,
                ignore=shutil.ignore_patterns('__pycache__', '.git')
            )
        else:
            shutil.copy2(src, dst)


def set_show_samples_false(kitchens_json_path):
    with open(kitchens_json_path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)
    data.setdefault('meta', {})['show_samples'] = False
    with open(kitchens_json_path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    return data


def pick_former_sample_slug(data):
    for k in data.get('kitchens', []):
        if k.get('sample'):
            return k.get('slug')
    return None


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep test output readable


def serve(directory, port):
    handler = lambda *a, **kw: QuietHandler(*a, directory=directory, **kw)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def wait_for_server(port, timeout=10):
    import urllib.request
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            urllib.request.urlopen('http://127.0.0.1:%d/' % port, timeout=1)
            return True
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.2)
    raise SystemExit('Server on port %d never came up: %s' % (port, last_err))


def screenshot(edge_path, profile_dir, url, out_path, width=1280, height=1600):
    os.makedirs(profile_dir, exist_ok=True)
    cmd = [
        edge_path,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--force-prefers-reduced-motion',
        '--user-data-dir=' + profile_dir,
        '--window-size=%d,%d' % (width, height),
        '--screenshot=' + out_path,
        '--virtual-time-budget=6000',
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0 or not os.path.isfile(out_path):
        raise SystemExit(
            'Screenshot failed for %s\nstdout: %s\nstderr: %s'
            % (url, result.stdout, result.stderr)
        )


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    edge_path = find_edge()

    tmp_site = tempfile.mkdtemp(prefix='tf-rehearsal-')
    edge_profiles = []
    httpd = None
    try:
        print('Copying site into %s ...' % tmp_site)
        copy_site(tmp_site)

        kitchens_json = os.path.join(tmp_site, 'data', 'kitchens.json')
        print('Setting meta.show_samples = false in the TEMP COPY only ...')
        data = set_show_samples_false(kitchens_json)
        former_sample_slug = pick_former_sample_slug(data)
        if not former_sample_slug:
            print('warn: no sample kitchen found in data/kitchens.json; '
                  'skipping the former-sample-kitchen screenshot.')

        port = free_port()
        httpd = serve(tmp_site, port)
        wait_for_server(port)
        base = 'http://127.0.0.1:%d' % port
        print('Serving temp copy at %s (show_samples=false)' % base)

        targets = [
            ('home.png', base + '/'),
            ('view-map.png', base + '/?view=map'),
            ('view-following.png', base + '/?view=following'),
            ('kitchens.png', base + '/kitchens.html'),
        ]
        if former_sample_slug:
            targets.insert(
                3,
                (
                    'former-sample-kitchen.png',
                    base + '/?k=' + former_sample_slug,
                ),
            )

        for filename, url in targets:
            prof = os.path.join(
                os.environ.get('LOCALAPPDATA', tempfile.gettempdir()),
                'Temp', 'edgeprof', uuid.uuid4().hex[:12]
            )
            edge_profiles.append(prof)
            out_path = os.path.join(out_dir, filename)
            print('Screenshotting %s -> %s' % (url, out_path))
            screenshot(edge_path, prof, url, out_path)

        print('\nDone. %d screenshots in %s' % (len(targets), out_dir))
        if former_sample_slug:
            print('Former sample kitchen used: %s' % former_sample_slug)
        return 0
    finally:
        if httpd is not None:
            httpd.shutdown()
        shutil.rmtree(tmp_site, ignore_errors=True)
        for prof in edge_profiles:
            shutil.rmtree(prof, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
