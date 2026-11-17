import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 640
out = os.path.join(os.path.dirname(__file__), "..", "assets", "banner.png")

img = Image.new("RGB", (W, H))
px = img.load()
for y in range(H):
    for x in range(W):
        t = (x / W * 0.7 + y / H * 0.3)
        r = int(11 + (34 - 11) * t)
        g = int(18 + (197 - 18) * t)
        b = int(32 + (94 - 32) * t)
        px[x, y] = (r, g, b)

d = ImageDraw.Draw(img)
# glow circle behind bolt
cx, cy = 200, H // 2
d.ellipse([cx - 150, cy - 150, cx + 150, cy + 150], fill=(163, 230, 53))
# bolt
bolt = [(0.58, 0.12), (0.30, 0.56), (0.48, 0.56), (0.40, 0.90), (0.72, 0.42), (0.52, 0.42)]
s = 300 / 512
pts = [(cx + (bx - 0.5) * 300, cy + (by - 0.5) * 300) for bx, by in bolt]
d.polygon(pts, fill=(11, 18, 32))

arial_bold = "C:/Windows/Fonts/arialbd.ttf"
arial = "C:/Windows/Fonts/arial.ttf"
f_big = ImageFont.truetype(arial_bold, 96)
f_sub = ImageFont.truetype(arial, 34)
f_tag = ImageFont.truetype(arial_bold, 26)

d.text((420, 220), "NutriSnap AI", font=f_big, fill=(255, 255, 255))
d.text((424, 340), "Snap your food. Know your calories. Hit your goal.", font=f_sub, fill=(163, 230, 53))
# pill: size the rounded box to the measured text so it fully covers it
pill = "PHOTO  >  ON-DEVICE AI  >  GOAL IMPACT"
pad_x, pad_y = 26, 14
tw = d.textlength(pill, font=f_tag)
tb = d.textbbox((0, 0), pill, font=f_tag)
th = tb[3] - tb[1]
bx, by = 424, 408
d.rounded_rectangle([bx, by, bx + tw + 2 * pad_x, by + th + 2 * pad_y], radius=(th + 2 * pad_y) // 2, outline=(163, 230, 53), width=3)
d.text((bx + pad_x, by + pad_y - tb[1]), pill, font=f_tag, fill=(232, 238, 251))

img.save(out)
print("wrote", out, img.size)
