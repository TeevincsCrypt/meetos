# Brand assets

The official Meetos logo is `meetos-logo-source.jpg` (supplied artwork). Everything
else is derived from it — don't redraw the logo.

| File | Use |
|---|---|
| `apps/web/public/brand/meetos-logo.png` / `-sm.webp` | Lockup on light backgrounds |
| `apps/web/public/brand/meetos-logo-dark.png` / `-sm.webp` | Lockup on dark backgrounds ("Meet" in light grey, mark unchanged) |
| `apps/web/public/brand/meetos-mark.png` / `-sm.webp` | Mark only |
| `apps/web/public/brand/meetos-icon-512.png`, `apple-touch-icon.png`, `favicon-*.png` | App icons |
| `apps/android/.../res/mipmap-*/ic_launcher*.png`, `mipmap-anydpi-v26/` | Android launcher (adaptive, legacy, round) |
| `apps/android/.../res/drawable(-night)-nodpi/meetos_logo.png` | In-app logo (light / dark) |

Usage notes

- Place the mark on white or the light/dark app surfaces. It loses contrast on the
  solid violet brand colour — don't put it there.
- Brand gradient (sampled from the mark): `#1DDABA → #1A9CF2 → #8B5AE7`. For gradient
  *text*, use the darker stops in `.text-logo-gradient` (≥ 3:1 contrast for large text).

Regenerate (needs Python with Pillow, NumPy, SciPy):

```bash
python3 scripts/brand-extract.py docs/brand/meetos-logo-source.jpg && python3 scripts/brand-build.py rgba2.npy
```
