# Doom-on-badge port: session state (2026-08-26)

Goal: run Doom natively on the badge's RP2354A, pushing the e-ink as fast as
it can go. **Status: builds and boots on the badge, reproducibly hard-faults
mid `R_Init` — one strong lead to try next (see "Where it stands").**

## What this is

A port of [kilograham/rp2040-doom](https://github.com/kilograham/rp2040-doom)
(branch `defcon32`, the RP2350 DEFCON 32 badge version) to the Outpost badge:

- **Display**: new backend `eink.c` replaces `lcd.c`. Doom's renderer pumps
  320x200 RGB scanlines through `dispRenderLine()`; we downsample to 296x128,
  Bayer-dither to 1-bit, and push frames with the fast-partial-refresh path
  from this repo's `firmware/lib/ssd1680.py` (charge pump held up, old-RAM
  sync via 0x26 after each update, shortened LUT). Waveform: tpa=2,
  frame_rate=0x44, groups=1 → **11.5 fps** panel updates (the fastest setting
  `firmware/epaper/README.md` rates as still visible). The scanline pump is
  self-paced by hardware timer0 alarm **2** (150 µs/line), replacing the
  DEFCON LCD's DMA-IRQ pump. Menu "brightness" is mapped to dither bias.
- **Input**: 6 buttons (U=GP7 L=GP8 R=GP6 D=GP9 A=GP5 B=GP4, active low).
  Chords synthesize the missing DEFCON buttons: A+B=Start(menu),
  L+R=Select(enter), hold U+D=FN (strafe/FPS counter, FN+B cycles weapons).
  **U+D+A+B (and not L/R) = reboot to BOOTSEL** (reflash without the button).
  A chord "poisons" its constituent keys until physically released.
- **Board**: `boards/outpost_badge.h` (PICO_BOARD=outpost_badge), RP2350A,
  2 MB flash. Code at 0x10000000 (<256 KB), WHX-compressed shareware WAD at
  **0x10040000** (1,800,344 bytes, ends 0x101F7898), save games live in the
  ~34 KB above that (found at runtime by flash-aliasing probe — works on 2 MB).

## Files in this directory

- `doom-port.patch` — full diff of branch `outpost` vs `defcon32` in
  rp2040-doom. Apply to a fresh clone of kilograham/rp2040-doom@defcon32.
- `eink.c`, `pinoutOutpost.h`, `outpost_badge.h` — the new files (also in the
  patch; kept separately for readability).
- `apply_port.py` — applies the i_video.c / i_input.c / CMakeLists patches to
  a pristine defcon32 checkout (alternative to the .patch).
- `pack2.py` — **critical**: merges `doom_tiny.uf2` + `doom1.whx` into ONE
  UF2 stream with unified block numbering. Two concatenated UF2s do NOT work:
  the bootloader reboots after the first stream's block count and the WAD
  never lands (cost us one bricked-ish flash).
- `rebuild.sh` — WSL build script (paths assume ~/doom-badge layout below).
- `doom_outpost_full.uf2` — final build: no USB, UART stdio on GP0/GP1,
  save/load enabled. NOT YET TESTED (blocked on the R_Init fault).
- `doom_outpost_usbdebug.uf2` — debug build (`-DHACK_ENABLE_STDIO_USB=1`):
  USB-CDC stdio, **waits for a terminal connection before booting**, no
  save/load, WAD-checksum print at boot, stage prints, pump stats every 3 s.
  This is what is currently flashed on the badge.
- `doomlog.txt` — last captured boot log.

## Build environment (was in WSL Ubuntu on the Windows machine)

```
~/doom-badge/pico-sdk        # tag 2.1.1, lib/tinyusb submodule inited
~/doom-badge/pico-extras     # master (needs *_OVERLAY_SDK_SPINLOCKS defines, already patched in)
~/doom-badge/rp2040-doom     # branch "outpost" (committed), forked from defcon32
~/tools/cmake-3.31.6-linux-x86_64, ~/tools/ninja
```

Configure (from rp2040-doom):
```
cmake -GNinja -DCMAKE_BUILD_TYPE=MinSizeRel -DPICO_SDK_PATH=$HOME/doom-badge/pico-sdk \
  -DPICO_EXTRAS_PATH=$HOME/doom-badge/pico-extras -DPICO_BOARD=outpost_badge \
  -DPICO_BOARD_HEADER_DIRS=$PWD/boards [-DHACK_ENABLE_STDIO_USB=1] ..
ninja doom_tiny
python3 pack2.py build*/src/doom_tiny.uf2 out.uf2   # run from repo root (needs doom1.whx)
```
gcc: distro arm-none-eabi-gcc 13.2. If rebuilding on native Linux, recreate
this layout, apply `doom-port.patch`, and note pico/CMakeLists.txt in the
patch may contain the display-source `if` block twice (harmless duplicate).

## Where it stands — the open bug

Boot log (reproducible, twice):
```
WAD region: 49 57 48 58 checksum 45f35bf3     <- MATCHES host checksum: flash is INTACT
... W_Init OK, "DOOM Shareware" banner, I_Init, M_Init OK ...
R_Init: Init DOOM refresh daemon - .          <- freezes here, USB goes fully dead
```
- USB dying (control transfers time out) while a *panic* keeps USB alive
  (observed with the earlier "No WXD" panic) ⇒ this is a **hard fault on
  core 0**, in exception context, blocking the stdio-USB alarm-pool IRQ.
- It happens before ANY port display/input code runs (I_InitGraphics comes
  after R_Init; input pump later still).
- Flash reads are proven good (full 1.8 MB checksum passes at 270 MHz,
  QMI clkdiv=3 set by i_main.c).

**Top hypothesis (untested): zone memory exhaustion.** `Z_Init` reports only
0x2fce4 (~196 KB) because `src/pico/memmap_doom.ld` still declares
`RAM LENGTH = 256k` (RP2040 value) — but the RP2350 has 520 KB. With
`NO_IERROR=1`, an OOM in R_Init's texture setup doesn't panic; it likely
returns garbage and hard-faults. The port's ~10 KB of static e-ink buffers
shrank the zone below whatever the defcon build had.

**Next step**: in `memmap_doom.ld` set
```
RAM(rwx)      : ORIGIN = 0x20000000, LENGTH = 512k
SCRATCH_X(rwx): ORIGIN = 0x20080000, LENGTH = 4k
SCRATCH_Y(rwx): ORIGIN = 0x20081000, LENGTH = 4k
```
(0x20080000/0x20081000 are the RP2350's real scratch banks; the old
0x20040000 values are plain SRAM addresses that merely worked.)
Rebuild the usbdebug variant, reflash, confirm Z_Init reports a much larger
zone and R_Init completes; expect "eink: dispInit / base refresh done" then
"eink pump: N lines, M frames pushed" every 3 s (M/3 ≈ e-ink fps, target ~11).
If it still faults with a big zone, next suspects: whd texture cache areas
(`USE_MEMMAP_ONLY`, R_InitData paths) — instrument R_Init's sub-steps.

## Flashing / recovery on the physical badge

- Badge currently runs `doom_outpost_usbdebug.uf2`: it waits for a CDC
  terminal, prints the log above, then hard-faults. **USB is dead after the
  fault — only BOOT-button + replug reaches the bootloader.**
- BOOTSEL drive shows as `RP2350`; copy the packed UF2 onto it.
- When a (working) debug build is running, opening its COM port at **1200
  baud** reboots it to BOOTSEL (pico-sdk stdio-USB magic baud). The final
  build has no USB; use the U+D+A+B button combo instead.
- The e-ink may be left with ghosting/garbage after all this. The cure is
  in this repo: `./firmware/tools/deploy.sh recondition` (requires
  CircuitPython on the badge again —
  `adafruit-circuitpython-raspberry_pi_pico2-en_US-10.2.1.uf2` works, and
  `firmware/epaper/examples/badge.py` is the "RAYGEN RUPE" name badge that
  was on the device before the Doom work).

## Serial notes (Windows side; adapt for Linux)

- CDC appeared as COM11; logs captured with .NET SerialPort, DTR+RTS on.
  On Linux it'll be /dev/ttyACM0: `picocom -b 115200 /dev/ttyACM0`.
- The debug build's connect-wait means nothing boots until you open the port.
