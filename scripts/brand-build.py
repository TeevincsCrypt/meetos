import sys
import numpy as np
from PIL import Image
import os
rgba = np.load(sys.argv[1] if len(sys.argv) > 1 else 'rgba2.npy').astype(np.float64)
a = rgba[..., 3] / 255.0
# alpha was already cleaned by brand-extract.py
rgba[..., 3] = a * 255

top, bottom = 493, 945
mark_l, mark_r = 316, 943
text_l, text_r = 1056, 2260
pad = 14

def crop(l, r):
    out = rgba[top - pad:bottom + pad + 1, l - pad:r + pad + 1].copy()
    return out

def save(arr, path, width=None):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    if width:
        h = round(img.height * width / img.width)
        img = img.resize((width, h), Image.LANCZOS)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    img.save(path, optimize=True)
    return img

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB = os.path.join(ROOT, 'apps/web/public/brand')
# Mark
mark = crop(mark_l, mark_r)
save(mark, f'{WEB}/meetos-mark.png', width=512)

# Lockups
lock = crop(mark_l, text_r)
save(lock, f'{WEB}/meetos-logo.png', width=1200)
dark = lock.copy()
# Text region relative to the crop: recolour the navy "Meet" (dark, low-chroma) for dark backgrounds.
x0 = text_l - (mark_l - pad)
reg = dark[:, x0:]
rgb = reg[..., :3]
lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
chroma = rgb.max(axis=2) - rgb.min(axis=2)
navy = (lum < 140) & (chroma < 90)
reg[navy, 0], reg[navy, 1], reg[navy, 2] = 236, 237, 243
dark[:, x0:] = reg
save(dark, f'{WEB}/meetos-logo-dark.png', width=1200)

# Square mark canvases (favicons / app icons)
mimg = Image.fromarray(mark.astype(np.uint8), 'RGBA')
def square(size, scale=0.86, bgc=None, radius=0):
    canvas = Image.new('RGBA', (size, size), bgc or (0, 0, 0, 0))
    w = round(size * scale); h = round(mimg.height * w / mimg.width)
    m = mimg.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - w) // 2, (size - h) // 2))
    if radius:
        mask = Image.new('L', (size, size), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
        canvas.putalpha(Image.fromarray(np.minimum(np.asarray(canvas)[..., 3], np.asarray(mask)).astype(np.uint8)))
    return canvas

square(64).save(os.path.join(ROOT, 'apps/web/public/favicon-64.png'), optimize=True)
square(32, 0.95).save(os.path.join(ROOT, 'apps/web/public/favicon-32.png'), optimize=True)
square(180, 0.72, (255, 255, 255, 255)).save(os.path.join(ROOT, 'apps/web/public/apple-touch-icon.png'), optimize=True)
square(512, 0.72, (255, 255, 255, 255)).save(f'{WEB}/meetos-icon-512.png', optimize=True)

# Android launcher icons (legacy square + round), white background.
RES = os.path.join(ROOT, 'apps/android/app/src/main/res')
for dens, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    d = f'{RES}/mipmap-{dens}'
    os.makedirs(d, exist_ok=True)
    square(px, 0.70, (255, 255, 255, 255), radius=round(px * 0.22)).save(f'{d}/ic_launcher.png', optimize=True)
    r = square(px, 0.66, (255, 255, 255, 255))
    mask = Image.new('L', (px, px), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse([0, 0, px - 1, px - 1], fill=255)
    r.putalpha(mask)
    r.save(f'{d}/ic_launcher_round.png', optimize=True)
    # Adaptive icon foreground (108dp canvas, mark within the 66dp safe zone).
    fg = square(round(px * 108 / 48), 0.50)
    fg.save(f'{d}/ic_launcher_foreground.png', optimize=True)
# In-app logo drawables (light + night)
save(lock, f'{RES}/drawable-nodpi/meetos_logo.png', width=720)
save(dark, f'{RES}/drawable-night-nodpi/meetos_logo.png', width=720)
# Small WebP variants used in the web UI.
for src, dst, wd in [('meetos-logo.png', 'meetos-logo-sm.webp', 560), ('meetos-logo-dark.png', 'meetos-logo-dark-sm.webp', 560), ('meetos-mark.png', 'meetos-mark-sm.webp', 160)]:
    im = Image.open(f'{WEB}/{src}')
    im.resize((wd, round(im.height * wd / im.width)), Image.LANCZOS).save(f'{WEB}/{dst}', 'WEBP', quality=92, method=6)
print('ok')
