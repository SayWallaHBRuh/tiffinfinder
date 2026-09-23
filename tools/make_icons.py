#!/usr/bin/env python3
"""Generate Tiffin Finder PWA icons.

Draws the stacked-tiffin ("dabba") mark on an aubergine ground and writes:
  icons/icon-192.png        192x192, purpose "any"
  icons/icon-512.png        512x512, purpose "any"
  icons/maskable-512.png    512x512, purpose "maskable" (mark inside the 80% safe zone)
  icons/apple-touch-icon.png 180x180

Uses Pillow when available; otherwise falls back to a small pure-Python
rasterizer and PNG encoder (zlib + struct) so the script has no dependencies.

Run from anywhere:  python tools/make_icons.py
"""

from __future__ import annotations

import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "icons"))

# Brand colours (match styles.css tokens)
AUBERGINE = (0x3B, 0x16, 0x42)
CREAM = (0xF8, 0xF1, 0xE7)
TURMERIC_LIGHT = (0xF2, 0xB3, 0x3D)
TURMERIC = (0xE8, 0xA3, 0x17)
TURMERIC_DEEP = (0xC9, 0x87, 0x00)


def mark_shapes(size: float, scale: float):
    """Return the drawing list for the mark, in a 64-unit design grid mapped onto
    `size` pixels with the mark occupying `scale` of the canvas (centred).

    Each shape is a tuple: ("rrect", x, y, w, h, r, colour) or
    ("arc", cx, cy, radius, stroke_width, colour) for the top handle (upper half only).
    """
    unit = size * scale / 64.0
    offset = size * (1.0 - scale) / 2.0

    def u(v: float) -> float:
        return offset + v * unit

    def s(v: float) -> float:
        return v * unit

    shapes = [
        # handle: half-circle arc centred at (32, 17) radius 8, stroke 3
        ("arc", u(32), u(17), s(8), s(3.0), CREAM),
        ("rrect", u(17), u(17), s(30), s(11), s(4), TURMERIC_LIGHT),
        ("rrect", u(15), u(30), s(34), s(11), s(4), TURMERIC),
        ("rrect", u(13), u(43), s(38), s(12), s(5), TURMERIC_DEEP),
        # vertical strap
        ("rrect", u(30), u(13), s(4), s(44), s(2), CREAM),
    ]
    return shapes


# --------------------------------------------------------------------------
# Pillow path
# --------------------------------------------------------------------------
def render_with_pillow(size: int, scale: float, path: str) -> None:
    from PIL import Image, ImageDraw  # type: ignore

    ss = 4  # supersample for smooth edges
    big = size * ss
    img = Image.new("RGB", (big, big), AUBERGINE)
    draw = ImageDraw.Draw(img)
    for shape in mark_shapes(big, scale):
        if shape[0] == "rrect":
            _, x, y, w, h, r, colour = shape
            draw.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=colour)
        else:
            _, cx, cy, radius, width, colour = shape
            bbox = [cx - radius, cy - radius, cx + radius, cy + radius]
            draw.arc(bbox, start=180, end=360, fill=colour, width=int(round(width)))
            # round caps
            cap = width / 2.0
            for ex in (cx - radius, cx + radius):
                draw.ellipse([ex - cap, cy - cap, ex + cap, cy + cap], fill=colour)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG", optimize=True)


# --------------------------------------------------------------------------
# Pure-Python path
# --------------------------------------------------------------------------
def _inside_rrect(px: float, py: float, x: float, y: float, w: float, h: float, r: float) -> bool:
    if px < x or px > x + w or py < y or py > y + h:
        return False
    r = min(r, w / 2.0, h / 2.0)
    # corner tests
    if px < x + r and py < y + r:
        return (px - (x + r)) ** 2 + (py - (y + r)) ** 2 <= r * r
    if px > x + w - r and py < y + r:
        return (px - (x + w - r)) ** 2 + (py - (y + r)) ** 2 <= r * r
    if px < x + r and py > y + h - r:
        return (px - (x + r)) ** 2 + (py - (y + h - r)) ** 2 <= r * r
    if px > x + w - r and py > y + h - r:
        return (px - (x + w - r)) ** 2 + (py - (y + h - r)) ** 2 <= r * r
    return True


def _inside_arc(px: float, py: float, cx: float, cy: float, radius: float, width: float) -> bool:
    half = width / 2.0
    # round caps at the two ends (on the horizontal line through the centre)
    for ex in (cx - radius, cx + radius):
        if (px - ex) ** 2 + (py - cy) ** 2 <= half * half:
            return True
    if py > cy:
        return False
    d = math.hypot(px - cx, py - cy)
    return radius - half <= d <= radius + half


def render_pure_python(size: int, scale: float, path: str) -> None:
    ss = 3  # 3x3 supersampling
    samples = ss * ss
    bg = AUBERGINE
    # canvas as list of rows of [r,g,b] floats
    canvas = [[list(bg) for _ in range(size)] for _ in range(size)]
    shapes = mark_shapes(float(size), scale)

    for shape in shapes:
        if shape[0] == "rrect":
            _, x, y, w, h, r, colour = shape
            x0, y0 = int(math.floor(x)) - 1, int(math.floor(y)) - 1
            x1, y1 = int(math.ceil(x + w)) + 1, int(math.ceil(y + h)) + 1

            def test(px, py, x=x, y=y, w=w, h=h, r=r):
                return _inside_rrect(px, py, x, y, w, h, r)
        else:
            _, cx, cy, radius, width, colour = shape
            ext = radius + width
            x0, y0 = int(math.floor(cx - ext)) - 1, int(math.floor(cy - ext)) - 1
            x1, y1 = int(math.ceil(cx + ext)) + 1, int(math.ceil(cy + width)) + 1

            def test(px, py, cx=cx, cy=cy, radius=radius, width=width):
                return _inside_arc(px, py, cx, cy, radius, width)

        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(size, x1), min(size, y1)
        offsets = [(i + 0.5) / ss for i in range(ss)]
        for py in range(y0, y1):
            row = canvas[py]
            for px in range(x0, x1):
                hits = 0
                for oy in offsets:
                    sy = py + oy
                    for ox in offsets:
                        if test(px + ox, sy):
                            hits += 1
                if hits:
                    a = hits / samples
                    cell = row[px]
                    cell[0] = cell[0] * (1 - a) + colour[0] * a
                    cell[1] = cell[1] * (1 - a) + colour[1] * a
                    cell[2] = cell[2] * (1 - a) + colour[2] * a

    rows = []
    for row in canvas:
        b = bytearray()
        for cell in row:
            b.append(int(round(max(0, min(255, cell[0])))))
            b.append(int(round(max(0, min(255, cell[1])))))
            b.append(int(round(max(0, min(255, cell[2])))))
        rows.append(bytes(b))
    write_png(path, size, size, rows)


def write_png(path: str, width: int, height: int, rows: list[bytes]) -> None:
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)


# --------------------------------------------------------------------------
def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        import PIL  # noqa: F401
        renderer = render_with_pillow
        print("Using Pillow.")
    except Exception:
        renderer = render_pure_python
        print("Pillow not available; using the pure-Python renderer.")

    targets = [
        ("icon-192.png", 192, 0.92),
        ("icon-512.png", 512, 0.92),
        ("maskable-512.png", 512, 0.72),
        ("apple-touch-icon.png", 180, 0.92),
    ]
    for name, size, scale in targets:
        out = os.path.join(OUT_DIR, name)
        renderer(size, scale, out)
        print(f"wrote {out} ({size}x{size})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
