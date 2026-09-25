"""Automated layout and console check for Tiffin Finder.

Round 34's quality pass found a real horizontal-scroll bug (a kitchen
page's sticky tabs/order bar forcing the layout viewport wider than the
phone screen -- see docs/quality-pass-round34.md) by hand, page by page,
width by width. Nothing caught it automatically. This script is that
automatic check.

What it does
------------
 1. Copies the whole site into a temp directory (like rehearse_launch.py)
    and serves it with Python's built-in http.server on a free localhost
    port. A second temp copy has `data/kitchens.json`'s
    `meta.show_samples` flipped to `false`, for a second pass in the
    "launch" (samples hidden) state -- the real data/kitchens.json in
    this repo is never opened for writing.
 2. Launches headless Microsoft Edge with a fresh profile and
    `--force-prefers-reduced-motion`, and drives it over the Chrome
    DevTools Protocol (CDP) using a minimal stdlib WebSocket client
    (`SimpleWebSocket` below) -- no pip installs, standard library only.
 3. For every page x width x colour scheme x state combination, it sets
    the device metrics and emulated `prefers-color-scheme`, navigates,
    waits for the page to finish loading and settle, then checks:
      - `document.documentElement.scrollWidth <= window.innerWidth`
        (no horizontal overflow),
      - no element on the page is wider than the viewport (reports the
        first offender's tag/id/class),
      - exactly one `<h1>`,
      - no console errors or uncaught exceptions were logged.
 4. Prints a compact table (one row per combination) and a summary, and
    exits non-zero if anything failed.
 5. Cleans up the HTTP servers, the Edge process and its profile folder,
    and both temp site copies, even on error (try/finally throughout).

Pages checked: index (`/`), a kitchen page in demo mode, the map, the
guide, kitchens (owner page), the kitchens checklist and consent pages, a
poster, permitted, about, privacy, terms and 404.

Widths: 360, 390, 768, 1280 (phone, phone, tablet-ish/breakpoint,
desktop). Colour schemes: light and dark (`Emulation.setEmulatedMedia`).
States: the repo's own `show_samples` value, and forced `false` (launch
state) in a second temp copy only.

Usage
-----
    python tools/check_layout.py            full sweep (slow -- launches
                                             Edge many times over)
    python tools/check_layout.py --quick     360px + 1280px, light only

This is intentionally NOT part of tools/check_ship.py (it's slow and
needs Edge installed); run it by hand after UI changes -- see README.md,
"Before you ship".

Requires Microsoft Edge to be installed. Standard library only otherwise.
"""
from __future__ import print_function

import base64
import http.server
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_NAMES = {'.git', '__pycache__', '.DS_Store'}

EDGE_CANDIDATES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe'),
]

SAMPLE_SLUG = 'saffron-lane-rasoi'

# (label, path) -- path is joined onto the server's base URL.
PAGES = [
    ('index', '/'),
    ('kitchen-demo', '/?k=' + SAMPLE_SLUG + '&demo=1'),
    ('map', '/?view=map'),
    ('guide', '/guide.html'),
    ('kitchens', '/kitchens.html'),
    ('kitchens-checklist', '/kitchens-checklist.html'),
    ('kitchens-consent', '/kitchens-consent.html'),
    ('poster', '/poster.html?k=' + SAMPLE_SLUG),
    ('permitted', '/permitted.html'),
    ('about', '/about.html'),
    ('privacy', '/privacy.html'),
    ('terms', '/terms.html'),
    ('404', '/404.html'),
]

FULL_WIDTHS = [360, 390, 768, 1280]
QUICK_WIDTHS = [360, 1280]
FULL_SCHEMES = ['light', 'dark']
QUICK_SCHEMES = ['light']


# --------------------------------------------------------------------------
# Site copy + HTTP server (same pattern as tools/rehearse_launch.py)
# --------------------------------------------------------------------------

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


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


class QuietThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # Headless Edge routinely resets keep-alive connections; that's
        # normal browser behaviour, not a server bug -- don't spam the
        # console with a traceback for every one of them.
        pass


def serve(directory, port):
    handler = lambda *a, **kw: QuietHandler(*a, directory=directory, **kw)
    httpd = QuietThreadingServer(('127.0.0.1', port), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def wait_for_server(port, timeout=10):
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


def find_edge():
    for c in EDGE_CANDIDATES:
        if os.path.isfile(c):
            return c
    found = shutil.which('msedge')
    if found:
        return found
    raise SystemExit('Could not find msedge.exe. Checked: ' + ', '.join(EDGE_CANDIDATES))


# --------------------------------------------------------------------------
# Minimal stdlib WebSocket client (RFC 6455) -- just enough for CDP.
# --------------------------------------------------------------------------

class SimpleWebSocket(object):
    def __init__(self, url, timeout=15):
        if not url.startswith('ws://'):
            raise ValueError('only ws:// is supported, got: ' + url)
        rest = url[len('ws://'):]
        host_port, _, path = rest.partition('/')
        path = '/' + path
        if ':' in host_port:
            host, port_s = host_port.split(':', 1)
            port = int(port_s)
        else:
            host, port = host_port, 80

        self.sock = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode('ascii')
        req = (
            'GET {path} HTTP/1.1\r\n'
            'Host: {host}:{port}\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            'Sec-WebSocket-Key: {key}\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n'
        ).format(path=path, host=host, port=port, key=key)
        self.sock.sendall(req.encode('ascii'))

        resp = b''
        while b'\r\n\r\n' not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError('WebSocket handshake: connection closed early')
            resp += chunk
        header, _, leftover = resp.partition(b'\r\n\r\n')
        status_line = header.split(b'\r\n', 1)[0]
        if b'101' not in status_line:
            raise RuntimeError('WebSocket handshake failed: ' + header.decode('utf-8', 'replace'))
        self._buf = leftover
        self.sock.settimeout(None)

    def _recv_n(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError('WebSocket connection closed')
            self._buf += chunk
        data, self._buf = self._buf[:n], self._buf[n:]
        return data

    def send_text(self, text):
        payload = text.encode('utf-8')
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        length = len(payload)
        header = bytearray([0x81])  # FIN + text frame opcode
        if length <= 125:
            header.append(0x80 | length)
        elif length <= 0xFFFF:
            header.append(0x80 | 126)
            header += struct.pack('>H', length)
        else:
            header.append(0x80 | 127)
            header += struct.pack('>Q', length)
        header += mask
        self.sock.sendall(bytes(header) + masked)

    def _send_control(self, opcode, payload=b''):
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        header = bytearray([0x80 | opcode])
        header.append(0x80 | len(payload))
        header += mask
        self.sock.sendall(bytes(header) + masked)

    def recv_message(self):
        """Returns one complete decoded text message, or None on close."""
        parts = []
        while True:
            b1 = self._recv_n(1)[0]
            b2 = self._recv_n(1)[0]
            fin = b1 & 0x80
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack('>H', self._recv_n(2))[0]
            elif length == 127:
                length = struct.unpack('>Q', self._recv_n(8))[0]
            mask_key = self._recv_n(4) if masked else None
            payload = self._recv_n(length)
            if mask_key:
                payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
            if opcode == 0x9:  # ping
                self._send_control(0xA, payload)
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode == 0x8:  # close
                return None
            parts.append(payload)
            if fin:
                break
        return b''.join(parts).decode('utf-8', 'replace')

    def close(self):
        try:
            self.sock.close()
        except Exception:  # noqa: BLE001
            pass


class CDPClient(object):
    """A tiny synchronous Chrome DevTools Protocol client over one
    WebSocket connection: call() sends a command and waits for its
    matching response by id; events (no 'id') are queued separately."""

    def __init__(self, ws_url):
        self.ws = SimpleWebSocket(ws_url)
        self._next_id = 0
        self._lock = threading.Lock()
        self._results = {}
        self._events = []
        self._events_lock = threading.Lock()
        self._stop = False
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    def _read_loop(self):
        while not self._stop:
            try:
                msg = self.ws.recv_message()
            except Exception:  # noqa: BLE001
                break
            if msg is None:
                break
            try:
                data = json.loads(msg)
            except ValueError:
                continue
            if 'id' in data:
                with self._lock:
                    self._results[data['id']] = data
            else:
                with self._events_lock:
                    self._events.append(data)

    def send(self, method, params=None):
        with self._lock:
            self._next_id += 1
            msg_id = self._next_id
        self.ws.send_text(json.dumps({'id': msg_id, 'method': method, 'params': params or {}}))
        return msg_id

    def wait_result(self, msg_id, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                if msg_id in self._results:
                    return self._results.pop(msg_id)
            time.sleep(0.02)
        raise TimeoutError('CDP timed out waiting for response id %d' % msg_id)

    def call(self, method, params=None, timeout=15):
        msg_id = self.send(method, params)
        res = self.wait_result(msg_id, timeout)
        if 'error' in res:
            raise RuntimeError('%s failed: %s' % (method, res['error']))
        return res.get('result', {})

    def event_count(self):
        with self._events_lock:
            return len(self._events)

    def events_since(self, idx):
        with self._events_lock:
            return list(self._events[idx:])

    def close(self):
        self._stop = True
        self.ws.close()


def http_json(url, timeout=5, method=None):
    req = urllib.request.Request(url, method=method) if method else url
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def wait_for_devtools(port, timeout=20):
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            return http_json('http://127.0.0.1:%d/json/version' % port)
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.2)
    raise SystemExit('Edge DevTools endpoint on port %d never came up: %s' % (port, last_err))


# --------------------------------------------------------------------------
# Layout check
# --------------------------------------------------------------------------

LAYOUT_JS = r"""
(function () {
  var iw = window.innerWidth;
  var sw = document.documentElement.scrollWidth;
  // A page can legitimately hold more than one <h1> in the DOM at once
  // (e.g. index.html's hero heading stays in the DOM with `hidden` while
  // a kitchen page's own h1 is shown -- see app.js's `dom.hero.hidden =
  // isKitchen`); only the one actually rendered should count.
  var h1all = document.querySelectorAll('h1');
  var h1 = 0;
  for (var j = 0; j < h1all.length; j++) {
    var he = h1all[j];
    if (he.hidden || he.offsetParent === null) continue;
    var cs = window.getComputedStyle(he);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    h1++;
  }
  var offender = null;
  var els = document.querySelectorAll('body *');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var r = el.getBoundingClientRect();
    if (r.width > iw + 1) {
      var cls = (typeof el.className === 'string' && el.className.trim())
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
      offender = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls
        + ' (width ' + Math.round(r.width) + 'px)';
      break;
    }
  }
  return JSON.stringify({ innerWidth: iw, scrollWidth: sw, h1: h1, offender: offender });
})()
"""

CONSOLE_ERROR_EVENTS = {
    'Runtime.exceptionThrown': lambda ev: True,
    'Runtime.consoleAPICalled': lambda ev: ev.get('params', {}).get('type') == 'error',
    'Log.entryAdded': lambda ev: ev.get('params', {}).get('entry', {}).get('level') == 'error',
}


def count_console_errors(events):
    n = 0
    for ev in events:
        check = CONSOLE_ERROR_EVENTS.get(ev.get('method'))
        if check and check(ev):
            n += 1
    return n


def wait_for_load(cdp, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            res = cdp.call('Runtime.evaluate', {
                'expression': 'document.readyState',
                'returnByValue': True,
            }, timeout=5)
            if res.get('result', {}).get('value') == 'complete':
                return
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.1)


def check_one(cdp, base_url, page_path, width, scheme):
    cdp.call('Emulation.setDeviceMetricsOverride', {
        'width': width,
        'height': 900,
        'deviceScaleFactor': 1,
        'mobile': width < 768,
    })
    cdp.call('Emulation.setEmulatedMedia', {
        'features': [{'name': 'prefers-color-scheme', 'value': scheme}],
    })

    start_idx = cdp.event_count()
    cdp.call('Page.navigate', {'url': base_url + page_path}, timeout=20)
    wait_for_load(cdp)
    time.sleep(0.6)  # settle: async fetches (kitchens.json, dishes.json) + render

    result = cdp.call('Runtime.evaluate', {
        'expression': LAYOUT_JS,
        'returnByValue': True,
    }, timeout=10)
    value = result.get('result', {}).get('value')
    if value is None:
        raise RuntimeError('Runtime.evaluate returned no value for %s' % page_path)
    layout = json.loads(value)

    errors = count_console_errors(cdp.events_since(start_idx))

    overflow_ok = layout['scrollWidth'] <= layout['innerWidth'] + 1
    h1_ok = layout['h1'] == 1
    no_wide_el = layout['offender'] is None
    console_ok = errors == 0
    passed = overflow_ok and h1_ok and no_wide_el and console_ok

    return {
        'passed': passed,
        'scrollWidth': layout['scrollWidth'],
        'innerWidth': layout['innerWidth'],
        'overflow_ok': overflow_ok,
        'h1': layout['h1'],
        'h1_ok': h1_ok,
        'offender': layout['offender'],
        'console_errors': errors,
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    quick = '--quick' in sys.argv[1:]
    widths = QUICK_WIDTHS if quick else FULL_WIDTHS
    schemes = QUICK_SCHEMES if quick else FULL_SCHEMES

    start_time = time.time()
    edge_path = find_edge()

    tmp_normal = tempfile.mkdtemp(prefix='tf-layout-normal-')
    tmp_launch = tempfile.mkdtemp(prefix='tf-layout-launch-')
    edge_profile = os.path.join(
        os.environ.get('LOCALAPPDATA', tempfile.gettempdir()),
        'Temp', 'edgeprof', uuid.uuid4().hex[:12]
    )

    httpd_normal = None
    httpd_launch = None
    edge_proc = None
    cdp = None
    rows = []
    target_id = None
    devtools_port = None

    try:
        print('Copying site into %s (normal) and %s (launch) ...' % (tmp_normal, tmp_launch))
        copy_site(tmp_normal)
        copy_site(tmp_launch)
        set_show_samples_false(os.path.join(tmp_launch, 'data', 'kitchens.json'))

        port_normal = free_port()
        port_launch = free_port()
        httpd_normal = serve(tmp_normal, port_normal)
        httpd_launch = serve(tmp_launch, port_launch)
        wait_for_server(port_normal)
        wait_for_server(port_launch)
        base_normal = 'http://127.0.0.1:%d' % port_normal
        base_launch = 'http://127.0.0.1:%d' % port_launch

        devtools_port = free_port()
        os.makedirs(edge_profile, exist_ok=True)
        edge_cmd = [
            edge_path,
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--hide-scrollbars',
            '--force-prefers-reduced-motion',
            '--remote-debugging-port=%d' % devtools_port,
            '--user-data-dir=' + edge_profile,
        ]
        print('Launching headless Edge on devtools port %d ...' % devtools_port)
        edge_proc = subprocess.Popen(
            edge_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        wait_for_devtools(devtools_port)

        tab = http_json(
            'http://127.0.0.1:%d/json/new?about:blank' % devtools_port,
            method='PUT',
        )
        target_id = tab.get('id')
        ws_url = tab['webSocketDebuggerUrl']
        cdp = CDPClient(ws_url)
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Log.enable')

        states = [('normal', base_normal), ('launch', base_launch)]
        total = len(states) * len(PAGES) * len(widths) * len(schemes)
        done = 0
        for state_name, base_url in states:
            for page_name, page_path in PAGES:
                for width in widths:
                    for scheme in schemes:
                        done += 1
                        sys.stdout.write(
                            '\r[%d/%d] %-6s %-20s w=%-4d %-5s ...'
                            % (done, total, state_name, page_name, width, scheme)
                        )
                        sys.stdout.flush()
                        try:
                            r = check_one(cdp, base_url, page_path, width, scheme)
                        except Exception as e:  # noqa: BLE001
                            r = {
                                'passed': False, 'scrollWidth': '?', 'innerWidth': '?',
                                'overflow_ok': False, 'h1': '?', 'h1_ok': False,
                                'offender': 'ERROR: %s' % e, 'console_errors': '?',
                            }
                        r.update({
                            'state': state_name, 'page': page_name,
                            'width': width, 'scheme': scheme,
                        })
                        rows.append(r)
        sys.stdout.write('\r' + ' ' * 70 + '\r')
        sys.stdout.flush()

    finally:
        if cdp is not None:
            try:
                if target_id and devtools_port:
                    try:
                        urllib.request.urlopen(
                            'http://127.0.0.1:%d/json/close/%s' % (devtools_port, target_id),
                            timeout=3,
                        )
                    except Exception:  # noqa: BLE001
                        pass
                cdp.close()
            except Exception:  # noqa: BLE001
                pass
        if edge_proc is not None:
            try:
                edge_proc.terminate()
                edge_proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                try:
                    edge_proc.kill()
                except Exception:  # noqa: BLE001
                    pass
        if httpd_normal is not None:
            httpd_normal.shutdown()
        if httpd_launch is not None:
            httpd_launch.shutdown()
        shutil.rmtree(tmp_normal, ignore_errors=True)
        shutil.rmtree(tmp_launch, ignore_errors=True)
        shutil.rmtree(edge_profile, ignore_errors=True)

    # ---- print table ----
    header = '%-6s %-20s %-6s %-6s | %-4s | %-4s | %-3s | %-6s | %s' % (
        'STATE', 'PAGE', 'WIDTH', 'SCHEME', 'OVFL', 'H1', 'ERR', 'RESULT', 'OFFENDER / NOTE'
    )
    print(header)
    print('-' * len(header))
    fail_count = 0
    for r in rows:
        ok = r['passed']
        if not ok:
            fail_count += 1
        print('%-6s %-20s %-6s %-6s | %-4s | %-4s | %-3s | %-6s | %s' % (
            r['state'], r['page'], r['width'], r['scheme'],
            'ok' if r['overflow_ok'] else 'FAIL',
            'ok' if r['h1_ok'] else ('FAIL(%s)' % r['h1']),
            r['console_errors'],
            'PASS' if ok else 'FAIL',
            r['offender'] or '',
        ))

    elapsed = time.time() - start_time
    print('-' * len(header))
    print('%d/%d combinations passed (%d failed) in %.1fs' % (
        len(rows) - fail_count, len(rows), fail_count, elapsed
    ))

    return 1 if fail_count else 0


if __name__ == '__main__':
    sys.exit(main())
