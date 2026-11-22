"""
Home Screen / install icons for Baseball Pinball (iOS apple-touch-icon, Android/PWA 192/512, maskable 512).

    python3 scripts/make-icons.py      → public/icons/*.png

Every color and proportion is a named constant below so the icon can be retuned without touching the drawing.
Drawn at 4× and downsampled for smooth edges. Pillow only.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

BG_TOP = (14, 32, 66)        # stadium night, top
BG_BOTTOM = (6, 13, 26)      # matches theme-color #060d1a
GLOW = (120, 190, 255)       # floodlight halo behind the ball
BALL = (246, 244, 236)
BALL_SHADE = (205, 200, 188)
STITCH = (214, 38, 48)
BAT = (196, 140, 82)
BAT_DARK = (140, 92, 48)
BALL_R = 0.30                # ball radius as a fraction of the icon
SEAM_OFFSET = 1.22         # seam circle centers, × ball radius from the ball center
SEAM_RADIUS = 0.92         # seam circle radius, × ball radius
SEAM_WIDTH = 0.07
SAFE = 0.80                  # maskable safe zone (Android crops to a circle/squircle inside this)
SS = 4                       # supersampling

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')


def draw(size: int, maskable: bool) -> Image.Image:
    S = size * SS
    im = Image.new('RGB', (S, S), BG_BOTTOM)
    d = ImageDraw.Draw(im)
    for y in range(S):  # vertical gradient
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    k = SAFE if maskable else 0.94  # keep the art inside the safe zone for maskable icons
    cx, cy, r = S / 2, S / 2, S * BALL_R * k
    # floodlight glow
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - r * 1.9, cy - r * 1.9, cx + r * 1.9, cy + r * 1.9], fill=GLOW + (90,))
    im.paste(glow.filter(ImageFilter.GaussianBlur(r * 0.6)), (0, 0), glow.filter(ImageFilter.GaussianBlur(r * 0.6)))
    d = ImageDraw.Draw(im)
    # bat behind the ball, diagonal
    ang = math.radians(-40)
    L, w0, w1 = r * 3.1, r * 0.16, r * 0.36
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    a = (cx - ux * L * 0.55, cy - uy * L * 0.55 + r * 0.25)
    b = (cx + ux * L * 0.45, cy + uy * L * 0.45 + r * 0.25)
    poly = [(a[0] + px * w0, a[1] + py * w0), (b[0] + px * w1, b[1] + py * w1), (b[0] - px * w1, b[1] - py * w1), (a[0] - px * w0, a[1] - py * w0)]
    d.polygon(poly, fill=BAT)
    d.ellipse([b[0] - w1, b[1] - w1, b[0] + w1, b[1] + w1], fill=BAT)
    d.ellipse([a[0] - w0 * 1.5, a[1] - w0 * 1.5, a[0] + w0 * 1.5, a[1] + w0 * 1.5], fill=BAT_DARK)
    # ball with soft shading
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BALL_SHADE)
    d.ellipse([cx - r * 0.96, cy - r * 1.0, cx + r * 0.9, cy + r * 0.86], fill=BALL)
    # stitches: two seams bowing toward the middle, ") (" , with short cross ticks; clipped to the ball
    seam = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(seam)
    lw = max(2, int(r * SEAM_WIDTH))
    for side in (-1, 1):
        ccx, rr = cx + side * r * SEAM_OFFSET, r * SEAM_RADIUS
        sd.ellipse([ccx - rr, cy - rr, ccx + rr, cy + rr], outline=STITCH + (255,), width=lw)
        for deg in range(-60, 61, 12):
            t = math.radians(deg if side < 0 else 180 - deg)
            x, y = ccx + math.cos(t) * rr, cy + math.sin(t) * rr
            nx, ny = math.cos(t), math.sin(t)
            sd.line([(x - nx * r * 0.09, y - ny * r * 0.09), (x + nx * r * 0.09, y + ny * r * 0.09)], fill=STITCH + (255,), width=max(1, lw // 2))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([cx - r * 0.97, cy - r * 0.97, cx + r * 0.97, cy + r * 0.97], fill=255)
    clipped = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    clipped.paste(seam, (0, 0), Image.composite(seam.split()[3], Image.new('L', (S, S), 0), mask))
    im.paste(clipped, (0, 0), clipped)
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for name, size, maskable in [('apple-touch-icon.png', 180, False), ('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
    draw(size, maskable).save(os.path.join(OUT, name), optimize=True)
    print('wrote', name)
