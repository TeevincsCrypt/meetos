"""Clean cutout of the MEETOS logo from the supplied JPEG.

alpha  = smoothstep on the colour distance from the background
colour = original pixel colour for solid pixels; edge pixels take the colour of
         the nearest solid pixel, so strokes stay vivid on any background
noise  = connected components smaller than a few hundred pixels are dropped
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float64)
border = np.concatenate([im[:20].reshape(-1, 3), im[-20:].reshape(-1, 3), im[:, :20].reshape(-1, 3), im[:, -20:].reshape(-1, 3)])
bg = np.median(border, axis=0)
d = np.sqrt(((im - bg) ** 2).sum(axis=2))

LO, HI = 22.0, 70.0
t = np.clip((d - LO) / (HI - LO), 0, 1)
alpha = t * t * (3 - 2 * t)

# Drop specks: keep components of the (alpha>0) mask that are large.
lab, n = ndimage.label(alpha > 0.02)
sizes = ndimage.sum(np.ones_like(alpha), lab, index=np.arange(1, n + 1))
keep = np.zeros(n + 1, bool)
keep[1:] = sizes >= 400
alpha = alpha * keep[lab]

solid = d >= HI
# Nearest solid pixel for every pixel.
_, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
color = im[iy, ix]
color[solid] = im[solid]

rgba = np.dstack([color, alpha * 255])
np.save('rgba2.npy', rgba)
print('bg', bg, 'components kept', int(keep.sum()), 'of', n)
