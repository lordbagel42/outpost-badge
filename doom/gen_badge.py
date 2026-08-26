#!/usr/bin/env python3
"""Compose the 296x128 1-bit name-badge for the Outpost e-ink. Emits a preview
PNG and (with 'header') a C header in eink.c's fb_accum bit layout.

  python3 gen_badge.py            # preview only -> badge_preview.png
  python3 gen_badge.py header     # also write badge_image.h into the firmware
"""
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance, ImageChops
import sys, os

W, H = 296, 128
HERE   = os.path.dirname(os.path.abspath(__file__))
AVATAR = os.path.join(HERE, "badge_avatar.png")
LOGO   = os.path.expanduser("~/Projects/hackclub/open-sauce-2026/website/public/opensauce.png")
FONT_B = os.path.join(HERE, "PhantomSans-Bold.woff")   # Hack Club brand font
PREVIEW = os.path.join(HERE, "badge_preview.png")
HEADER  = os.path.expanduser("~/doom-badge/rp2040-doom/src/pico/badge_image.h")

def fnt(sz): return ImageFont.truetype(FONT_B, sz)

img = Image.new("L", (W, H), 255)          # 0=black, 255=white; white bg

# ---- avatar: auto-crop bg, fit into 128x128, contrast, FS dither ----
if os.path.exists(AVATAR):
    av = Image.open(AVATAR).convert("RGB")
    # key out the uniform background (sampled at a corner) -> pure white, so it
    # doesn't dither into a noisy gray field; keep the character as line art.
    bgcol = av.getpixel((2, 2))
    fgmask = ImageChops.difference(av, Image.new("RGB", av.size, bgcol)) \
                 .convert("L").point(lambda p: 255 if p > 30 else 0)
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
    # push the light lavender fills toward white so mainly the ink lines dither
    sq = ImageEnhance.Brightness(sq).enhance(1.18)
    sq = ImageEnhance.Contrast(sq).enhance(1.6)
    img.paste(sq.convert("1").convert("L"), (W - 128, 0))
else:
    ph = ImageDraw.Draw(img)
    ph.rectangle([W - 128, 0, W - 1, H - 1], outline=0, width=1)
    ph.line([(W - 128, 0), (W - 1, H - 1)], fill=0)
    ph.line([(W - 1, 0), (W - 128, H - 1)], fill=0)
    ph.text((W - 118, 54), "avatar", font=fnt(14), fill=0)

# ---- bottom row: HACK CLUB flag (left) + Open Sauce logo (right) ----
FLAG = os.path.join(HERE, "flag.png")
# flag: red body + white text -> map to black flag with white "HACK CLUB"
flag = Image.open(FLAG).convert("RGBA")
fbg = Image.new("RGBA", flag.size, (255, 255, 255, 255))
fbg.alpha_composite(flag)
fl = fbg.convert("L")
# high-contrast threshold: white text/outline stays white, red body -> black
fl = fl.point(lambda p: 255 if p > 170 else 0)
FLAG_W = 96
fl = fl.resize((FLAG_W, int(fl.height * FLAG_W / fl.width)), Image.LANCZOS).convert("1")
img.paste(fl.convert("L"), (4, H - fl.height - 8))

# Open Sauce logo: light art on transparent -> dark-on-white, dither; to the
# right of the flag now.
logo = Image.open(LOGO).convert("RGBA")
bgk = Image.new("RGBA", logo.size, (0, 0, 0, 255))
bgk.alpha_composite(logo)
lg = ImageOps.invert(bgk.convert("L"))
lg = ImageEnhance.Contrast(lg).enhance(1.6)
LOGO_H = 56
lg = lg.resize((int(lg.width * LOGO_H / lg.height), LOGO_H), Image.LANCZOS)
img.paste(lg.convert("1").convert("L"), (W - 128 - lg.width - 6, H - LOGO_H - 6))

# ---- text (left column), auto-fit to column width ----
d = ImageDraw.Draw(img)
COL_W = W - 128 - 12
def fit(text, max_px, max_sz):
    for sz in range(max_sz, 7, -1):
        if d.textlength(text, font=fnt(sz)) <= max_px:
            return fnt(sz)
    return fnt(8)
d.text((6, 4),  "@Raygen Rupe",      font=fit("@Raygen Rupe", COL_W, 24),      fill=0)

# OUTPOST banner (replaces the "Hack Club Outpost" text): dark banner + cream
# "OUTPOST" -> black banner with white letters; flames threshold in too.
outp = Image.open(os.path.join(HERE, "outpost_banner.png")).convert("RGBA")
obg = Image.new("RGBA", outp.size, (255, 255, 255, 255))
obg.alpha_composite(outp)
ol = obg.convert("L").point(lambda p: 255 if p > 150 else 0)
# trim transparent/white margins so it packs tight
obb = obg.split()[3].point(lambda p: 255 if p > 8 else 0).getbbox()
if obb:
    ol = ol.crop(obb)
OUTP_W = COL_W
ol = ol.resize((OUTP_W, max(1, int(ol.height * OUTP_W / ol.width))), Image.LANCZOS).convert("1")
img.paste(ol.convert("L"), (6, 30))
d.line([(W - 129, 0), (W - 129, H)], fill=0, width=1)

bw = img.convert("1")

prev = ImageOps.expand(bw.convert("L").resize((W * 3, H * 3), Image.NEAREST), border=6, fill=128)
prev.save(PREVIEW)

# ---- pack: idx=(295-x)*16+(y>>3), bit=0x80>>(y&7); set bit = WHITE ----
px = bw.load()
STRIDE = 16
buf = bytearray(STRIDE * W)
for x in range(W):
    for y in range(H):
        if px[x, y]:
            buf[(W - 1 - x) * STRIDE + (y >> 3)] |= (0x80 >> (y & 7))

if len(sys.argv) > 1 and sys.argv[1] == "header":
    with open(HEADER, "w") as f:
        f.write("// Auto-generated name-badge (296x128, eink fb_accum layout).\n")
        f.write("// Regenerate: python3 doom/gen_badge.py header\n")
        f.write("#pragma once\n#include <stdint.h>\n")
        f.write(f"static const uint8_t badge_image[{len(buf)}] = {{\n")
        for i in range(0, len(buf), 16):
            f.write("    " + ",".join(str(b) for b in buf[i:i + 16]) + ",\n")
        f.write("};\n")
    print("wrote", HEADER, len(buf), "bytes")
print("preview:", PREVIEW)
