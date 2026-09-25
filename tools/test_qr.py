"""Correctness test for qr.js, the site's from-scratch QR Code encoder.

This is a TEST-ONLY script. It never runs as part of the site and it
never ships Project Nayuki's reference implementation -- it just imports
it, from wherever you point --reference at, to compare module-for-module
against qr.js. See README-qr-test.md in this folder for how to re-run
this after downloading the reference on a fresh machine.

Usage:

    python tools/test_qr.py --reference "C:\\path\\to\\qrcodegen.py" \
        [--node "C:\\path\\to\\node.exe"]

What it checks, for a batch of >= 60 inputs (every sample kitchen's own
solo link, byte-length values right around each version 1-10 boundary at
error-correction level M, and a handful of random ASCII/UTF-8 strings):

  1. Automatic mode: qr.js's QR.encode(bytes) (auto version + auto best
     mask) produces the exact same version, and the exact same module
     matrix, as Nayuki's QrCode.encode_segments(..., ecl=MEDIUM,
     minversion=1, maxversion=10, mask=-1, boostecl=False).
  2. Forced-mask mode: for every input and every mask 0-7, qr.js's
     internals (driven directly, bypassing its own mask-choice step) and
     Nayuki's QrCode with that same mask forced produce the exact same
     module matrix.

Exits 0 and prints a summary if every comparison is bit-identical, exits
1 and prints exactly what differed otherwise.
"""
from __future__ import print_function

import argparse
import json
import os
import random
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../site


def load_reference(reference_path):
    """Imports Nayuki's qrcodegen module from an arbitrary path, without
    ever copying it into this repo."""
    ref_path = reference_path
    if os.path.isdir(ref_path):
        ref_path = os.path.join(ref_path, 'qrcodegen.py')
    if not os.path.isfile(ref_path):
        print('FAIL: reference qrcodegen.py not found at %r' % ref_path)
        sys.exit(2)
    ref_dir = os.path.dirname(ref_path)
    sys.path.insert(0, ref_dir)
    import qrcodegen  # noqa: E402  (imported from --reference, not vendored)
    return qrcodegen


def find_node(explicit):
    if explicit:
        return explicit
    env = os.environ.get('QR_TEST_NODE')
    if env:
        return env
    # Known location on this machine (see TIFFIN-FINDER-HANDOFF.md).
    guess = (r"C:\Users\Adeel Ahmed\.cache\codex-runtimes\codex-primary-runtime"
             r"\dependencies\node\bin\node.exe")
    if os.path.isfile(guess):
        return guess
    return 'node'  # hope it's on PATH


def build_test_inputs():
    inputs = []  # list of (label, text)

    # 1. Every sample kitchen's own solo URL.
    kitchens_path = os.path.join(ROOT, 'data', 'kitchens.json')
    with open(kitchens_path, 'rb') as fh:
        data = json.load(fh)
    for k in data.get('kitchens', []):
        slug = k.get('slug')
        if not slug:
            continue
        url = 'https://tiffinfinder.ca/?k=%s&solo=1' % slug
        inputs.append(('kitchen:%s' % slug, url))

    # 2. Edge lengths right around each version's byte-capacity boundary
    #    at level M. Byte-mode capacity in bytes for version v (1-9 use
    #    an 8-bit char-count field, version 10 uses 16-bit):
    #    floor((data_codewords*8 - 4 - cci_bits) / 8).
    data_codewords_m = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216]
    for v in range(1, 11):
        cci_bits = 8 if v <= 9 else 16
        capacity_bytes = (data_codewords_m[v - 1] * 8 - 4 - cci_bits) // 8
        for delta in (-2, -1, 0, 1, 2):
            n = capacity_bytes + delta
            if n < 1:
                continue
            text = 'https://tiffinfinder.ca/?k=' + ('a' * max(0, n - 28)) + '&solo=1'
            # Pad/trim precisely to n ASCII bytes so we hit the exact boundary.
            if len(text) > n:
                text = text[:n]
            elif len(text) < n:
                text = text + ('x' * (n - len(text)))
            inputs.append(('boundary:v%d:%+d:len%d' % (v, delta, n), text))

    # 3. A handful of random ASCII and UTF-8 strings (deterministic seed
    #    so failures reproduce).
    rng = random.Random(20260925)
    ascii_pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.?=&/:'
    utf8_pool = 'café naïve façade résumé Zürich Poutine ☕🍛🙂 north-east àéîöü 你好 مرحبا'
    for i in range(20):
        length = rng.randint(1, 120)
        s = ''.join(rng.choice(ascii_pool) for _ in range(length))
        inputs.append(('random-ascii:%d' % i, s))
    for i in range(10):
        length = rng.randint(1, 40)
        chars = [rng.choice(utf8_pool) for _ in range(length)]
        inputs.append(('random-utf8:%d' % i, ''.join(chars)))

    return inputs


def run_node(node_path, requests):
    runner = os.path.join(ROOT, 'tools', 'qr_node_runner.js')
    proc = subprocess.run(
        [node_path, runner],
        input=json.dumps(requests).encode('utf-8'),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=ROOT
    )
    if proc.returncode != 0:
        print('FAIL: node runner exited %d' % proc.returncode)
        print(proc.stderr.decode('utf-8', 'replace'))
        sys.exit(2)
    return json.loads(proc.stdout.decode('utf-8'))


def reference_matrix(qrcodegen, data_bytes, mask):
    ecl = qrcodegen.QrCode.Ecc.MEDIUM
    seg = qrcodegen.QrSegment.make_bytes(data_bytes)
    qr = qrcodegen.QrCode.encode_segments(
        [seg], ecl, minversion=1, maxversion=10, mask=mask, boostecl=False)
    size = qr.get_size()
    rows = []
    for y in range(size):
        row = ''.join('1' if qr.get_module(x, y) else '0' for x in range(size))
        rows.append(row)
    return qr.get_version(), qr.get_mask(), size, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reference', required=True,
                     help='Path to Nayuki qrcodegen.py, or its containing folder '
                          '(downloaded separately -- see README-qr-test.md)')
    ap.add_argument('--node', default=None, help='Path to node.exe')
    args = ap.parse_args()

    qrcodegen = load_reference(args.reference)
    node_path = find_node(args.node)

    test_inputs = build_test_inputs()
    print('Built %d test inputs.' % len(test_inputs))

    requests = []
    for idx, (label, text) in enumerate(test_inputs):
        data_bytes = text.encode('utf-8')
        requests.append({'id': idx, 'bytes': list(data_bytes)})

    node_results = run_node(node_path, requests)
    assert len(node_results) == len(test_inputs)

    failures = []
    auto_checked = 0
    forced_checked = 0

    for idx, (label, text) in enumerate(test_inputs):
        data_bytes = text.encode('utf-8')
        node_entry = node_results[idx]

        # --- Automatic mask selection ---
        try:
            ref_version, ref_mask, ref_size, ref_rows = reference_matrix(qrcodegen, data_bytes, -1)
            ref_auto_error = None
        except Exception as e:
            ref_auto_error = e
            ref_version = ref_mask = ref_size = ref_rows = None

        if ref_auto_error is not None:
            # Both sides correctly refusing input that's too long for
            # versions 1-10 at level M is a match, not a failure. Still
            # fall through to the forced-mask loop below, which should
            # reject the same way for every mask.
            if 'autoError' in node_entry:
                auto_checked += 1
            else:
                failures.append('%s: reference (auto) raised %r but qr.js accepted it'
                                 % (label, ref_auto_error))
        elif 'autoError' in node_entry:
            failures.append('%s: qr.js (auto) raised %s' % (label, node_entry['autoError']))
        else:
            auto = node_entry['auto']
            if auto['version'] != ref_version:
                failures.append('%s: auto version mismatch qr.js=%d reference=%d'
                                 % (label, auto['version'], ref_version))
            elif auto['mask'] != ref_mask:
                failures.append('%s: auto mask mismatch qr.js=%d reference=%d'
                                 % (label, auto['mask'], ref_mask))
            elif auto['rows'] != ref_rows:
                failures.append('%s: auto module matrix differs (version %d, mask %d)'
                                 % (label, ref_version, ref_mask))
            else:
                auto_checked += 1

        # --- Forced mask, all 8 ---
        for m in range(8):
            entry = node_entry['forced'].get(str(m), node_entry['forced'].get(m))
            try:
                fv, fm, fsize, frows = reference_matrix(qrcodegen, data_bytes, m)
            except Exception as e:
                if entry is not None and 'error' in entry:
                    forced_checked += 1
                else:
                    failures.append('%s mask=%d: reference raised %r but qr.js accepted it'
                                     % (label, m, e))
                continue
            if entry is None or 'error' in entry:
                failures.append('%s mask=%d: qr.js raised %s'
                                 % (label, m, entry.get('error') if entry else 'missing'))
                continue
            if entry['version'] != fv:
                failures.append('%s mask=%d: version mismatch qr.js=%d reference=%d'
                                 % (label, m, entry['version'], fv))
            elif entry['rows'] != frows:
                failures.append('%s mask=%d: module matrix differs (version %d)'
                                 % (label, m, fv))
            else:
                forced_checked += 1

    total_comparisons = auto_checked + forced_checked
    print('Auto-mask comparisons matched: %d / %d' % (auto_checked, len(test_inputs)))
    print('Forced-mask comparisons matched: %d / %d' % (forced_checked, len(test_inputs) * 8))

    if failures:
        print('\nFAIL: %d comparison(s) did not match:' % len(failures))
        for f in failures[:50]:
            print('  - ' + f)
        if len(failures) > 50:
            print('  ... and %d more' % (len(failures) - 50))
        sys.exit(1)

    print('\nPASS: qr.js is bit-identical to the reference encoder across '
          '%d inputs (%d total comparisons, auto + all 8 forced masks).'
          % (len(test_inputs), total_comparisons))
    sys.exit(0)


if __name__ == '__main__':
    main()
