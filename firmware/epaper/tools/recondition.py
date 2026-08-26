# recondition.py -- clear ghosting, and undo accumulated one-way bias.
#
# Two different problems, two different remedies. Run this whenever the panel
# looks wrong after heavy partial-refresh use.
#
# ---------------------------------------------------------------------------
# PROBLEM 1: GHOSTING.  Faint remains of previous images.
#
# Partial refresh never clears a pixel the way the factory waveform does, so
# old images build up. Balanced black/white inversions with the factory
# waveform drive every pixel to both rails and re-level the pigment.
# CYCLES handles this, and it is the safe, well-understood part of this tool.
#
# ---------------------------------------------------------------------------
# PROBLEM 2: REGIONAL BIAS.  A patch of the panel is permanently lighter or
# darker than the rest, along the boundary of whatever was on screen.
#
# This is NOT ghosting and inversions alone do not fix it. It comes from the
# partial LUT, and the driver's own comment about it was wrong. Decoding
# WF_PARTIAL:
#
#     LUT0  old=0 new=0  (stays black)   group 0: VSS    group 1: VSH1
#     LUT3  old=1 new=1  (stays white)   group 0: VSS    group 1: VSL
#
# So an UNCHANGED pixel is not undriven. In group 1 it takes a single-direction
# pulse every frame -- toward white if it is sitting black, toward black if it
# is sitting white -- and nothing ever balances it.
#
# The cost is proportional to how long a pixel sits still. Playing a 2089-frame
# video with white bars down each side gave those bars:
#
#     2089 frames x 20 ms of group-1 VSL  =  ~42 seconds of one-way drive
#
# while the changing centre used LUT1/LUT2, the balanced transition pair. The
# bars came out visibly darker than the middle, and eight ordinary inversions
# did not recover them.
#
# THE COUNTER-MEASURE, and it is a hypothesis, not a proven fix:
# group 1's direction depends on the colour a pixel is HOLDING, so the colour we
# hold is the lever. A pixel held black accumulates the opposite bias to one
# held white.
#
# It has to be SELECTIVE. Holding the WHOLE panel black nudges every pixel
# equally -- bars and centre alike -- so the difference between them survives
# and simply moves. Nothing saturates during a black hold either, since every
# pixel sits at the black rail with room to travel. A uniform counter-bias
# shifts the panel and leaves the bands.
#
# So two frames are alternated:
#
#     frame A   bars black, centre black
#     frame B   bars black, centre WHITE
#
#   * the bars are unchanged across both, so they take the group-1 bias every
#     frame -- the counter-dose we want;
#   * the centre alternates, so it uses LUT1 and LUT2, which are equal and
#     opposite, and nets to zero.
#
# BIAS_CENTER_W is the width to spare. For a video letterboxed to 172 px in a
# 296 px panel, the bars are the outer 62 px on each side.
#
# Why it might not work: if the residue is trapped charge rather than pigment
# position, drive is the wrong tool and leaving the board unpowered for a few
# hours may do more. Start with a SMALL dose and look at the result. Do not
# run it repeatedly if nothing changes -- that is just more one-way drive on a
# panel already showing signs of it.
#
# ---------------------------------------------------------------------------
# Finish with SHOW_FIELD. A uniform 50% dither is the most sensitive test
# available for regional unevenness -- far more revealing than plain white,
# because every pixel is mid-transition and small differences in pigment
# position show up as a visible patch.

import time
import board
import busio
from ssd1680 import SSD1680, WIDTH, HEIGHT

CYCLES = 8               # balanced factory inversions (ghost removal)
BIAS_SECONDS = 10.0      # counter-bias dose; 0 disables. Bad Apple applied
                         # ~42 s, but start small and look before adding more.
BIAS_CENTER_W = 172      # width (px) left neutral; the rest gets the dose.
                         # 0 biases the whole panel -- rarely what you want.
SETTLE_CYCLES = 2        # inversions after the counter-bias, to re-level
SHOW_FIELD = True        # end on a 50% dither to reveal any unevenness

STRIDE = WIDTH // 8
FRAME_BYTES = STRIDE * HEIGHT
# Group 1 is TPA=1, and one drive frame at frame rate 0x44 is 20 ms. That is
# how much bias each partial update applies to a pixel that is holding still.
BIAS_PER_FRAME = 0.020

spi = busio.SPI(clock=board.GP14, MOSI=board.GP15)
epd = SSD1680(spi, board.GP13, board.GP17, board.GP18, board.GP16,
              baudrate=20_000_000)
epd.timeout = 5.0

print("\n=== recondition ===")
print("init (SW reset -> factory OTP waveform):", epd.init())

white = bytearray(b"\xFF" * FRAME_BYTES)
black = bytearray(FRAME_BYTES)
# 50% checkerboard, alternating every row so it reads as flat grey rather than
# as stripes.
field = bytearray(FRAME_BYTES)
for r in range(HEIGHT):
    o = r * STRIDE
    pat = 0xAA if (r & 1) else 0x55
    for b in range(STRIDE):
        field[o + b] = pat


def invert(n, label):
    for i in range(n):
        dt_b, _ = epd.display_base(black)     # display_base seeds BOTH RAMs, so
        dt_w, _ = epd.display_base(white)     # the reference cannot go stale
        print("  %s %d/%d  (black %.2fs, white %.2fs)" % (label, i + 1, n, dt_b, dt_w))


try:
    print("\n[1] %d balanced inversions -- clears ghosting" % CYCLES)
    invert(CYCLES, "cycle")

    if BIAS_SECONDS > 0:
        frames = int(BIAS_SECONDS / BIAS_PER_FRAME)
        # Screen x maps to a panel ROW, so the side bars are ranges of rows.
        bars = (WIDTH if BIAS_CENTER_W <= 0
                else (HEIGHT - BIAS_CENTER_W) // 2)
        a = bytearray(FRAME_BYTES)                 # all black
        b = bytearray(FRAME_BYTES)                 # bars black, centre white
        if BIAS_CENTER_W > 0:
            for r in range(bars, HEIGHT - bars):
                o = r * STRIDE
                for i in range(STRIDE):
                    b[o + i] = 0xFF
        print("\n[2] counter-bias: %d frames (~%.0f s of drive, ~%.1f min wall)"
              % (frames, BIAS_SECONDS, frames * 0.107 / 60))
        if BIAS_CENTER_W > 0:
            print("    biasing the outer %d px each side; centre %d px "
                  "alternates and nets to zero" % (bars, BIAS_CENTER_W))
        else:
            print("    biasing the WHOLE panel -- this shifts everything "
                  "equally and will not fix a regional difference")
        print("    groups=None on purpose: group 1 is the biasing phase, and")
        print("    here we want it, aimed the other way.")
        epd.display_base(a)
        epd.arm_partial(tpa=2, frame_rate=0x44, groups=None)
        for i in range(frames):
            epd.frame_nopower(a if (i & 1) else b, mode=0x04, sync_old=True)
            if (i + 1) % 100 == 0:
                print("    %d/%d" % (i + 1, frames))
        epd.power_off()
        print("\n[3] %d settling inversions" % SETTLE_CYCLES)
        epd.init()
        invert(SETTLE_CYCLES, "settle")

    epd.init()
    if SHOW_FIELD:
        epd.display_base(field)
        print("\n50%% dither field. Look for patches lighter or darker than the")
        print("rest -- that is regional bias, and it will follow the outline of")
        print("whatever was displayed for a long time. A clean panel is even.")
    else:
        epd.display_base(white)
        print("\ndone -- panel should be uniformly white, no stripes.")
finally:
    epd.power_off()
