"""Round 29 quality pass: strip redundant trailing ".0" from numbers in the
site's hand-authored SVG icons (icons/*.svg). "139.0" and "139" are the same
number to an SVG renderer, so this changes nothing about how any icon looks
-- it only removes bytes that don't do anything. No path coordinates are
rounded (every number in these files already has at most one decimal place;
see docs/quality-pass-round29.md), so there is nothing to round, only to
de-redundify.

Usage: python tools/optimize_svg.py [--check]
  --check   report savings without writing (used to verify before/after).
"""
import re
import sys
from pathlib import Path

ICONS_DIR = Path(__file__).resolve().parent.parent / 'icons'

# A run-of-digits, a literal decimal point, then exactly "0", followed by a
# non-digit (or end of string) so "10.05" or "1.02" are left untouched.
DOT_ZERO_RE = re.compile(r'(-?\d+)\.0(?=[^0-9]|$)')


def optimize(text):
    return DOT_ZERO_RE.sub(r'\1', text)


def main():
    check_only = '--check' in sys.argv
    total_before = 0
    total_after = 0
    for path in sorted(ICONS_DIR.glob('*.svg')):
        before = path.read_text(encoding='utf-8')
        after = optimize(before)
        total_before += len(before.encode('utf-8'))
        total_after += len(after.encode('utf-8'))
        if before != after:
            print('%s: %d -> %d bytes' % (path.name, len(before.encode('utf-8')), len(after.encode('utf-8'))))
            if not check_only:
                # Keep LF line endings, no trailing-newline changes.
                path.write_text(after, encoding='utf-8', newline='\n')
    print('Total: %d -> %d bytes (saved %d)' % (total_before, total_after, total_before - total_after))


if __name__ == '__main__':
    main()
