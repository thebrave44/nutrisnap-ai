import os
from PIL import Image, ImageDraw, ImageFont

outdir = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(outdir, exist_ok=True)

def make(size, path):
    img = Image.new('RGB', (size, size), (0, 0, 0))
    d = ImageDraw.Draw(img)
    # lime -> green diagonal gradient
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(163 + (34 - 163) * t)
            g = int(230 + (197 - 230) * t)
            b = int(53 + (94 - 53) * t)
            img.putpixel((x, y), (r, g, b))
    # rounded mask
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    pad = int(size * 0.06)
    md.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.22), fill=255)
    img = Image.composite(img, Image.new('RGB', (size, size), (15, 23, 42)), mask)
    d = ImageDraw.Draw(img)
    # white flame-ish bolt: draw a simple lightning bolt polygon
    cx, cy = size / 2, size / 2
    s = size / 512
    bolt = [
        (0.58, 0.12), (0.30, 0.56), (0.48, 0.56), (0.40, 0.90),
        (0.72, 0.42), (0.52, 0.42),
    ]
    pts = [(cx + (x - 0.5) * size, cy + (y - 0.5) * size) for x, y in bolt]
    d.polygon(pts, fill=(255, 255, 255))
    img.save(path)
    print('wrote', path)

make(192, os.path.join(outdir, 'icon-192.png'))
make(512, os.path.join(outdir, 'icon-512.png'))
make(180, os.path.join(outdir, 'icon-180.png'))
