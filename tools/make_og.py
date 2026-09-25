"""Render og-image.png (1200x630) with Pillow -- no headless browser needed.

Matches the look of tools/og.html (the design source, styled by og.css) and
the colour tokens in ../styles.css:

    --brand-2 #22603c, --brand-3 #154129  (background gradient)
    --accent #e8912d, accent tints #f4b35e / #c9731a  (tiffin-carrier art, pill)
    --on-brand #fbf7ef  (headline / body text, cream)
    --on-brand-accent #fad29a  (eyebrow)
    --on-brand-muted #cfe0d4  (sub-line)
    --ink #17271d  (text on the accent pill)

Fonts: Windows system fonts only (Georgia for the serif wordmark/headline,
Segoe UI for the sans body text) -- nothing is embedded in the repo.

Usage:
    python tools/make_og.py [output_path]

Defaults to writing ../og-image.png (i.e. site/og-image.png) next to this
tools/ folder. Also writes a losslessly-optimised PNG (optimize=True,
minimal palette where possible) to stay well under WhatsApp's 300 KB limit.
"""
from __future__ import print_function

import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = r"C:\Windows\Fonts"

W, H = 1200, 630

# Colours, lifted straight from styles.css tokens (see module docstring).
BRAND_2 = (0x22, 0x60, 0x3c)
BRAND_3 = (0x15, 0x41, 0x29)
ACCENT = (0xe8, 0x91, 0x2d)
ACCENT_LIGHT = (0xf4, 0xb3, 0x5e)
ACCENT_DARK = (0xc9, 0x73, 0x1a)
CREAM = (0xfb, 0xf7, 0xef)
ACCENT_TEXT = (0xfa, 0xd2, 0x9a)
MUTED = (0xcf, 0xe0, 0xd4)
INK = (0x17, 0x27, 0x1d)


def font(path, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, path), size)


def radial_gradient(size, center, radius, inner_rgba, outer_rgba):
    """A soft radial glow as its own RGBA layer, blurred for a smooth falloff."""
    w, h = size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Draw at 1/3 scale then upscale+blur: much faster than a per-pixel loop
    # at full 1200x630, and the blur hides the downscale softening anyway.
    scale = 4
    sw, sh = w // scale, h // scale
    small = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    px = small.load()
    cx, cy = center[0] / scale, center[1] / scale
    r = radius / scale
    for y in range(sh):
        for x in range(sw):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            t = min(1.0, d / r)
            t = t * t  # ease-out falloff similar to a CSS radial-gradient
            a = inner_rgba[3] * (1 - t) + outer_rgba[3] * t
            px[x, y] = (inner_rgba[0], inner_rgba[1], inner_rgba[2], int(a))
    small = small.resize((w, h), Image.BILINEAR)
    return small


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def wrap_text(draw, text, fnt, max_width):
    """Greedy word-wrap: returns a list of lines, each <= max_width px."""
    words = text.split()
    lines = []
    cur = ""
    for word in words:
        trial = (cur + " " + word).strip()
        w = draw.textbbox((0, 0), trial, font=fnt)[2]
        if w <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_tracked_text(draw, xy, text, fnt, fill, tracking=0):
    """Draw text with extra letter-spacing (px between glyphs), since PIL
    has no native tracking support."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        cw = draw.textbbox((0, 0), ch, font=fnt)[2]
        x += cw + tracking
    return x


def draw_tiffin(base, cx, cy, scale, shadow=True):
    """The stacked-tiffin-carrier glyph from tools/og.html, drawn with
    primitives (rounded bars + a straight cream handle/clasp) at (cx, cy)
    centre, sized by `scale` (1.0 == the ~300px hero art in og.html)."""
    w = int(300 * scale)
    tile = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    u = w / 64.0  # og.html's glyphs are drawn on a 64x64 viewBox

    def pt(x, y):
        return (x * u, y * u)

    # Three stacked tiers, largest/darkest at the bottom (matches og.html's
    # .art svg: rows at y=16/30/44, widths 34/38/42, heights 12/12/13).
    rounded_rect(d, [pt(15, 16), pt(49, 28)], 4.5 * u, ACCENT_LIGHT)
    rounded_rect(d, [pt(13, 30), pt(51, 42)], 4.5 * u, ACCENT)
    rounded_rect(d, [pt(11, 44), pt(53, 57)], 5.5 * u, ACCENT_DARK)

    # Faint highlight strip on each tier (cream, low opacity).
    d.rounded_rectangle([pt(18, 18.5), pt(28, 20.9)], 1.2 * u, fill=CREAM + (115,))
    d.rounded_rectangle([pt(16, 32.5), pt(26, 34.9)], 1.2 * u, fill=CREAM + (89,))
    d.rounded_rectangle([pt(14, 46.5), pt(24, 48.9)], 1.2 * u, fill=CREAM + (71,))

    # Carry handle (open arc) above the stack.
    handle_w = max(2, int(3 * u))
    d.arc([pt(23, 8), pt(41, 26)], start=200, end=340, fill=CREAM, width=handle_w)

    # Vertical clasp bar through the centre of all three tiers.
    rounded_rect(d, [pt(30, 12), pt(34.2, 58)], 2.1 * u, CREAM)

    if shadow:
        shadow_layer = Image.new("RGBA", tile.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_layer)
        sd.ellipse([w * 0.06, w * 0.82, w * 0.94, w * 1.02], fill=(8, 28, 16, 90))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(w * 0.03))
        base.alpha_composite(shadow_layer, (int(cx - w / 2), int(cy - w / 2)))

    base.alpha_composite(tile, (int(cx - w / 2), int(cy - w / 2)))


def build(out_path):
    img = Image.new("RGB", (W, H), BRAND_3)

    # Diagonal brand gradient (linear-gradient(160deg, brand-2, brand-3)):
    # approximate with a vertical-ish blend along the gradient axis.
    import math
    angle = math.radians(160 - 90)  # CSS 160deg measured from "up"
    dx, dy = math.cos(angle), math.sin(angle)
    base = Image.new("RGB", (W, H))
    bpx = base.load()
    # Project every corner onto the gradient axis to get the 0..1 range.
    corners = [(0, 0), (W, 0), (0, H), (W, H)]
    projs = [cx * dx + cy * dy for cx, cy in corners]
    pmin, pmax = min(projs), max(projs)
    span = (pmax - pmin) or 1
    for y in range(H):
        for x in range(0, W, 2):  # step 2, then fill the pair -- 2x faster
            t = ((x * dx + y * dy) - pmin) / span
            t = max(0.0, min(1.0, t))
            r = int(BRAND_2[0] * (1 - t) + BRAND_3[0] * t)
            g = int(BRAND_2[1] * (1 - t) + BRAND_3[1] * t)
            b = int(BRAND_2[2] * (1 - t) + BRAND_3[2] * t)
            bpx[x, y] = (r, g, b)
            if x + 1 < W:
                bpx[x + 1, y] = (r, g, b)
    img = base.convert("RGBA")

    # Two soft radial glows (matches og.css's two radial-gradients).
    glow1 = radial_gradient((W, H), (int(W * 0.88), int(H * 0.18)), 640, ACCENT + (77,), ACCENT + (0,))
    glow2 = radial_gradient((W, H), (0, H), 520, (250, 210, 154, 36), (250, 210, 154, 0))
    img.alpha_composite(glow1)
    img.alpha_composite(glow2)

    # Faint cream disc behind the art (matches .art: rgb(251 247 239 / .07),
    # centred at (930, 330), 420px across).
    disc = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(disc)
    dd.ellipse([930 - 210, 330 - 210, 930 + 210, 330 + 210], fill=CREAM + (18,))
    img.alpha_composite(disc)

    draw = ImageDraw.Draw(img)

    # --- Brand row: tiffin glyph + wordmark -------------------------------
    brand_top = 84
    glyph_size = 52
    draw_tiffin(img, 88 + glyph_size // 2, brand_top + glyph_size // 2, glyph_size / 300.0, shadow=False)
    draw = ImageDraw.Draw(img)  # re-bind after alpha_composite calls
    wordmark_font = font("georgiab.ttf", 38)
    wm_x = 88 + glyph_size + 16
    wm_bbox = draw.textbbox((0, 0), "Tiffin Finder", font=wordmark_font)
    wm_h = wm_bbox[3] - wm_bbox[1]
    draw.text((wm_x, brand_top + glyph_size / 2 - wm_h / 2 - wm_bbox[1]), "Tiffin Finder",
               font=wordmark_font, fill=CREAM)

    # --- Eyebrow ------------------------------------------------------------
    eyebrow_font = font("segoeuib.ttf", 19)
    eyebrow_y = brand_top + 36 + 52  # og.css: 36px margin-top under the brand row
    eyebrow_text = "CALGARY \u00b7 PERMIT-CHECKED TIFFINS"
    draw_tracked_text(draw, (88, eyebrow_y), eyebrow_text, eyebrow_font, ACCENT_TEXT, tracking=2.4)

    # --- Headline (Fraunces -> Georgia Bold stand-in) ------------------------
    # Text column is 700px wide (matches .copy), starting at x=88; wrap to
    # stay well clear of the hero art circle (left edge at x=720).
    copy_max_width = 660
    h1_font = font("georgiab.ttf", 50)
    h1_y = eyebrow_y + 20 + 20
    headline = "Find a permit-checked tiffin kitchen in Calgary."
    h1_lines = wrap_text(draw, headline, h1_font, copy_max_width)
    line_gap = 58
    for i, line in enumerate(h1_lines):
        draw.text((88, h1_y + i * line_gap), line, font=h1_font, fill=CREAM)
    h1_bottom = h1_y + (len(h1_lines) - 1) * line_gap + line_gap

    # --- Sub-line ---------------------------------------------------------
    sub_font = font("segoeuib.ttf", 24)
    sub_y = h1_bottom + 14
    sub_lines = wrap_text(draw, "Browse by quadrant, cuisine and price. Order by WhatsApp or phone.",
                           sub_font, copy_max_width)
    for i, line in enumerate(sub_lines):
        draw.text((88, sub_y + i * 36), line, font=sub_font, fill=MUTED)

    # --- Pill: tiffinfinder.ca -------------------------------------------------
    pill_font = font("segoeuib.ttf", 23)
    pill_text = "tiffinfinder.ca"
    pill_pad_x, pill_pad_y = 26, 14
    pbbox = draw.textbbox((0, 0), pill_text, font=pill_font)
    pw = (pbbox[2] - pbbox[0]) + pill_pad_x * 2
    ph = (pbbox[3] - pbbox[1]) + pill_pad_y * 2
    pill_left, pill_bottom = 88, H - 72
    pill_top = pill_bottom - ph
    rounded_rect(draw, [pill_left, pill_top, pill_left + pw, pill_bottom], ph / 2, ACCENT)
    draw.text((pill_left + pill_pad_x - pbbox[0], pill_top + pill_pad_y - pbbox[1]), pill_text,
               font=pill_font, fill=INK)

    # --- Hero art: the stacked tiffin carrier, right side ---------------------
    draw_tiffin(img, 930, 330, 1.0, shadow=True)

    img = img.convert("RGB")
    img.save(out_path, format="PNG", optimize=True)
    return out_path


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "og-image.png")
    build(out_path)
    size = os.path.getsize(out_path)
    print("wrote %s (%d bytes, %.1f KB)" % (out_path, size, size / 1024.0))
    if size > 300 * 1024:
        print("WARNING: over WhatsApp's 300 KB limit")


if __name__ == "__main__":
    main()
