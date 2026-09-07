#!/usr/bin/env python3
"""Reproduce the original gen_badge.py per-asset image processing for the web
editor. Outputs grayscale (or 2-tone) PNGs on a white field into static/logos/
so the editor's dither pass renders them the way the baked badge did:

  - avatar:     key out the uniform background -> white, crop to subject, contrast
  - open sauce: composite on black, invert, contrast (dark-on-white line art)
  - hack club:  composite on white, threshold (black flag / white text)
  - OUTPOST:    composite on white, threshold, trim transparent margins

Run: python3 tools/prep-assets.py   (needs Pillow)
"""
from PIL import Image, ImageOps, ImageEnhance, ImageChops
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "static", "logos"))
DOOM = os.path.expanduser("~/Projects/outpost-badge/doom")
OS_SRC = os.path.expanduser("~/Projects/hackclub/open-sauce-2026/website/public/opensauce.png")

os.makedirs(OUT, exist_ok=True)


def save(im, name):
    p = os.path.join(OUT, name)
    im.convert("L").save(p)
    print(f"{name}: {im.size}  aspect={im.size[0]/im.size[1]:.2f}")


# ---- avatar: key bg -> white, crop to subject, contain 128, brightness+contrast
av = Image.open(os.path.join(DOOM, "badge_avatar.png")).convert("RGB")
bgcol = av.getpixel((2, 2))
fgmask = (ImageChops.difference(av, Image.new("RGB", av.size, bgcol))
          .convert("L").point(lambda p: 255 if p > 30 else 0))
gray = av.convert("L")
keyed = Image.composite(gray, Image.new("L", av.size, 255), fgmask)
bbox = fgmask.getbbox()
if bbox:
    pad = 12
    l, t, r, b = bbox
    keyed = keyed.crop((max(0, l - pad), max(0, t - pad),
                        min(av.width, r + pad), min(av.height, b + pad)))
keyed = ImageOps.contain(keyed, (128, 128), Image.LANCZOS)
sq = Image.new("L", (128, 128), 255)
sq.paste(keyed, ((128 - keyed.width) // 2, (128 - keyed.height) // 2))
sq = ImageEnhance.Brightness(sq).enhance(1.18)
sq = ImageEnhance.Contrast(sq).enhance(1.6)
save(sq, "raygen-avatar.png")

# ---- open sauce: composite on black -> invert -> contrast (dark-on-white)
logo = Image.open(OS_SRC).convert("RGBA")
bgk = Image.new("RGBA", logo.size, (0, 0, 0, 255))
bgk.alpha_composite(logo)
lg = ImageOps.invert(bgk.convert("L"))
lg = ImageEnhance.Contrast(lg).enhance(1.6)
save(lg, "open-sauce.png")

# ---- hack club flag: composite on white -> threshold 170 (black flag/white text)
flag = Image.open(os.path.join(DOOM, "flag.png")).convert("RGBA")
fbg = Image.new("RGBA", flag.size, (255, 255, 255, 255))
fbg.alpha_composite(flag)
fl = fbg.convert("L").point(lambda p: 255 if p > 170 else 0)
save(fl, "hackclub-flag.png")

# ---- OUTPOST banner: composite on white -> threshold 150 -> trim margins
outp = Image.open(os.path.join(DOOM, "outpost_banner.png")).convert("RGBA")
obg = Image.new("RGBA", outp.size, (255, 255, 255, 255))
obg.alpha_composite(outp)
ol = obg.convert("L").point(lambda p: 255 if p > 150 else 0)
alpha_bbox = obg.split()[3].point(lambda p: 255 if p > 8 else 0).getbbox()
if alpha_bbox:
    ol = ol.crop(alpha_bbox)
save(ol, "outpost-banner.png")
