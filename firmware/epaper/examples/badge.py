# badge.py -- static name badge: "RAYGEN RUPE" on the Outpost badge e-ink.
#
# One clean full refresh (factory waveform, 2.29 s), then idle. A full refresh
# powers the panel down inside its own sequence, so no power_off() is needed
# and the image persists with zero drive.
#
# Geometry follows epaper/examples/flappy.py: landscape, FPC cable left,
# screen x = panel row (296), screen y = bits within a row (128), FLIP_X=True.

import time
import board
import busio
from ssd1680 import SSD1680

NROWS = 296            # screen width  (panel rows)
NCOLS = 128            # screen height (bits within a row)
STRIDE = NCOLS // 8
FLIP_X = True
FLIP_Y = False

spi = busio.SPI(clock=board.GP14, MOSI=board.GP15)
epd = SSD1680(spi, board.GP13, board.GP17, board.GP18, board.GP16, baudrate=20_000_000)

FRAME = bytearray(b"\xFF" * (STRIDE * NROWS))   # bit 1 = white


def span(buf, off, y0, y1):
    if FLIP_Y:
        y0, y1 = NCOLS - 1 - y1, NCOLS - 1 - y0
    if y0 < 0:
        y0 = 0
    if y1 > NCOLS - 1:
        y1 = NCOLS - 1
    if y1 < y0:
        return
    b0 = y0 >> 3
    b1 = y1 >> 3
    if b0 == b1:
        m = 0
        for c in range(y0, y1 + 1):
            m |= 0x80 >> (c & 7)
        buf[off + b0] &= 0xFF ^ m
        return
    m = 0
    for c in range(y0, (b0 << 3) + 8):
        m |= 0x80 >> (c & 7)
    buf[off + b0] &= 0xFF ^ m
    for b in range(b0 + 1, b1):
        buf[off + b] = 0x00
    m = 0
    for c in range(b1 << 3, y1 + 1):
        m |= 0x80 >> (c & 7)
    buf[off + b1] &= 0xFF ^ m


def rect(buf, x0, x1, y0, y1):
    """Filled rectangle in screen coordinates (x0..x1, y0..y1 inclusive)."""
    if FLIP_X:
        x0, x1 = NROWS - 1 - x1, NROWS - 1 - x0
    if x0 < 0:
        x0 = 0
    if x1 > NROWS - 1:
        x1 = NROWS - 1
    for x in range(x0, x1 + 1):
        span(buf, x * STRIDE, y0, y1)


# 5x7 uppercase glyphs, drawn as rect() runs. No mirroring needed: FLIP_X and
# the viewing inversion cancel for static shapes (see the note in flappy.py).
FONT = {
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "N": ("10001", "11001", "11001", "10101", "10011", "10011", "10001"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    " ": ("00000",) * 7,
}


def text(buf, s, x, y, scale):
    for k, ch in enumerate(s):
        pat = FONT[ch]
        ox = x + k * 6 * scale
        for ry in range(7):
            line = pat[ry]
            run = None
            for cx in range(6):
                on = cx < 5 and line[cx] == "1"
                if on and run is None:
                    run = cx
                elif not on and run is not None:
                    rect(buf, ox + run * scale, ox + cx * scale - 1,
                         y + ry * scale, y + (ry + 1) * scale - 1)
                    run = None


def text_width(s, scale):
    return len(s) * 6 * scale - scale


def centered(buf, s, y, scale):
    text(buf, s, (NROWS - text_width(s, scale)) // 2, y, scale)


# ---- compose the badge -------------------------------------------------------
# double border frame
rect(FRAME, 0, NROWS - 1, 0, 2)
rect(FRAME, 0, NROWS - 1, NCOLS - 3, NCOLS - 1)
rect(FRAME, 0, 2, 0, NCOLS - 1)
rect(FRAME, NROWS - 3, NROWS - 1, 0, NCOLS - 1)
rect(FRAME, 6, NROWS - 7, 5, 6)
rect(FRAME, 6, NROWS - 7, NCOLS - 7, NCOLS - 6)
rect(FRAME, 5, 6, 6, NCOLS - 7)
rect(FRAME, NROWS - 7, NROWS - 6, 6, NCOLS - 7)

# name, two lines, centered
centered(FRAME, "RAYGEN", 22, 5)     # 35 px tall
centered(FRAME, "RUPE", 68, 5)

print("\n=== name badge ===")
print("init ok:", epd.init())
t, ok = epd.display_full(FRAME)
print("full refresh: %.2f s, busy ok: %s" % (t, ok))

while True:
    time.sleep(60)
