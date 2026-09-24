"""Place the sample kitchens' made-up pickup points.

Run from the tiffinfinder folder:

    python tools/sample_pickup.py

For every sample kitchen that offers pickup ("service": "pickup" or "both")
this writes a "pickup" block with precision "community", the label
"Sample location · <area>", no lat/lon, and a made-up point somewhere inside
the kitchen's base community on the map. Delivery-only kitchens get
"pickup": null. Kitchens without "sample": true are left exactly as they are.

The points are in the coordinate frame of the city's own map file
(data/map/calgary.json for Calgary, the raw data/map/airdrie.json frame for
Airdrie; the app adds the Airdrie offset itself). They are placed with a
fixed recipe (hashes of the slugs, no randomness), so running this twice
gives a byte-identical data/kitchens.json. The file keeps its own newline
style (LF or CRLF) and its trailing-newline state. Standard library only.

It stops with an error, naming the kitchen, when a point can't be placed
well inside its community, or when any of the checks below fail.
"""
import hashlib
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KITCHENS = os.path.join(ROOT, 'data', 'kitchens.json')
MAPS = {
    'calgary': os.path.join(ROOT, 'data', 'map', 'calgary.json'),
    'airdrie': os.path.join(ROOT, 'data', 'map', 'airdrie.json'),
}
GENERATED = '2026-09-23'
PICKUP_NOTE = "Sample pickup points are made-up spots inside each kitchen's neighbourhood. No street locations."
LABEL_PREFIX = 'Sample location · '
TRIES = 12
MIN_APART = 6.0
NUM_RE = re.compile(r'-?(?:\d+\.?\d*|\.\d+)')


def fail(message):
    sys.stderr.write('sample_pickup: ' + message + '\n')
    sys.exit(1)


def community_slug(name):
    """Same rule as communitySlug() in app.js."""
    s = str(name or '').lower()
    s = re.sub(r"['’]", '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def hash8(text):
    return int(hashlib.sha256(text.encode('utf-8')).hexdigest()[:8], 16)


def rings_of(path):
    """'M x y L x y x y Z M ...' -> [[(x, y), ...], ...]"""
    rings = []
    for chunk in path.split('M'):
        nums = [float(n) for n in NUM_RE.findall(chunk)]
        pts = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
        if len(pts) >= 3:
            rings.append(pts)
    return rings


def inside(rings, x, y):
    """Even-odd ray cast over every ring (holes count as outside)."""
    hit = False
    for pts in rings:
        n = len(pts)
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
    return hit


def edge_distance(rings, x, y):
    best = float('inf')
    for pts in rings:
        n = len(pts)
        for i in range(n):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % n]
            dx = bx - ax
            dy = by - ay
            length2 = dx * dx + dy * dy
            t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length2))
            px = ax + t * dx
            py = ay + t * dy
            best = min(best, math.hypot(x - px, y - py))
    return best


def load_json(path):
    with open(path, 'rb') as fh:
        return json.loads(fh.read().decode('utf-8'))


def main():
    areas = {}
    for city, path in MAPS.items():
        for c in load_json(path).get('communities', []):
            areas[(city, c['slug'])] = c

    with open(KITCHENS, 'rb') as fh:
        raw = fh.read()
    newline = '\r\n' if b'\r\n' in raw else '\n'
    trailing = raw.endswith(newline.encode('ascii'))
    data = json.loads(raw.decode('utf-8'))
    kitchens = data.get('kitchens', [])

    # Checks every kitchen must pass, and the sample pickup kitchens grouped
    # by base community.
    groups = {}
    for k in kitchens:
        slug = k.get('slug', '?')
        service = k.get('service')
        if service not in ('pickup', 'delivery', 'both'):
            fail(slug + ': service must be "pickup", "delivery" or "both"')
        base = k.get('base_community') or {}
        city = base.get('city')
        if city not in MAPS:
            fail(slug + ': base_community.city must be calgary or airdrie')
        if (city == 'airdrie') != (k.get('quadrant') == 'Airdrie'):
            fail(slug + ': quadrant ' + str(k.get('quadrant')) + ' does not match city ' + city)
        if community_slug(k.get('area')) != base.get('slug'):
            fail(slug + ': area "' + str(k.get('area')) + '" does not match base_community ' + str(base.get('slug')))
        if (city, base.get('slug')) not in areas:
            fail(slug + ': base_community ' + city + ':' + str(base.get('slug')) + ' is not in the map file')
        if service != 'pickup' and not (k.get('delivery') or {}).get('areas'):
            fail(slug + ': ' + service + ' needs delivery areas')
        if k.get('sample') is True and service != 'delivery':
            groups.setdefault((city, base['slug']), []).append(k)

    points = {}
    for key in sorted(groups):
        group = sorted(groups[key], key=lambda k: k['slug'])
        area = areas[key]
        rings = rings_of(area['path'])
        lx, ly = float(area['label'][0]), float(area['label'][1])
        room = float(area['label_room'])
        min_edge = min(4.0, 0.25 * room)
        min_label = min(4.0, 0.3 * room)
        base_angle = (hash8(key[1]) % 3600) / 3600.0 * 2 * math.pi
        n = len(group)
        placed = []
        for i, k in enumerate(group):
            h = hash8(k['slug'])
            theta = base_angle + i * 2 * math.pi / n + ((h % 1000) / 1000.0 - 0.5) * 0.6
            f = 0.45 + ((h >> 10) % 1000) / 1000.0 * 0.25
            point = None
            for _ in range(TRIES):
                x = round(lx + room * f * math.cos(theta), 1)
                y = round(ly + room * f * math.sin(theta), 1)
                if inside(rings, x, y) and edge_distance(rings, x, y) >= min_edge:
                    point = (x, y)
                    break
                f *= 0.85
            if point is None:
                fail(k['slug'] + ': no pickup point fits inside ' + key[0] + ':' + key[1])
            if math.hypot(point[0] - lx, point[1] - ly) < min_label:
                fail(k['slug'] + ': pickup point is too close to the community label point')
            for other_slug, other in placed:
                if math.hypot(point[0] - other[0], point[1] - other[1]) < MIN_APART:
                    fail(k['slug'] + ': pickup point is within ' + str(MIN_APART) + ' units of ' + other_slug)
            placed.append((k['slug'], point))
            points[k['slug']] = point

    rebuilt = []
    for k in kitchens:
        pickup = k.get('pickup')
        if k.get('sample') is True:
            if k['service'] == 'delivery':
                pickup = None
            else:
                old = pickup if isinstance(pickup, dict) else {}
                notes = old.get('notes') if isinstance(old.get('notes'), str) else ''
                label = LABEL_PREFIX + k['area']
                if re.search(r'\d', label):
                    fail(k['slug'] + ': the sample label must not contain a digit')
                pickup = {
                    'precision': 'community',
                    'label': label,
                    'point': [points[k['slug']][0], points[k['slug']][1]],
                    'lat': None,
                    'lon': None,
                    'notes': notes,
                }
        # service and pickup go directly after base_community.
        out = {}
        for key, value in k.items():
            if key in ('service', 'pickup'):
                continue
            out[key] = value
            if key == 'base_community':
                out['service'] = k['service']
                out['pickup'] = pickup
        rebuilt.append(out)
    data['kitchens'] = rebuilt

    meta = data.setdefault('meta', {})
    meta['generated'] = GENERATED
    meta['pickup_note'] = PICKUP_NOTE

    text = json.dumps(data, indent=2, ensure_ascii=False)
    if newline != '\n':
        text = text.replace('\n', newline)
    if trailing:
        text += newline
    with open(KITCHENS, 'wb') as fh:
        fh.write(text.encode('utf-8'))
    print('sample_pickup: placed ' + str(len(points)) + ' sample pickup points')


if __name__ == '__main__':
    main()
