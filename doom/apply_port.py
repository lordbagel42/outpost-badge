#!/usr/bin/env python3
# Apply the Outpost badge port patches to the rp2040-doom defcon32 checkout.
import sys, re

root = sys.argv[1]

def patch(path, old, new, count=1):
    p = root + "/" + path
    s = open(p).read()
    if new in s and old not in s:
        print("already patched:", path)
        return
    assert s.count(old) == count, f"pattern not found ({s.count(old)}x) in {path}: {old[:60]!r}"
    open(p, "w").write(s.replace(old, new))
    print("patched:", path)

# ---- i_video.c: e-ink pump sends the doom line number, no LCD stretch ----
patch("src/pico/i_video.c",
"""    if (stretch) {
        dispRenderLine(asl++, sdata[which] + 1, 320);
        // duplicate ever 6th line by simply not updating any of the other
        // state or redrawing the next time around
        if ((asl % 6) == 0) return;
    } else {
        uint16_t lsl = scanvideo_scanline_number(fake_scanline_buffer.scanline_id);
        dispRenderLine(lsl + 20, sdata[which] + 1, 320);
    }""",
"""#ifdef OUTPOST_BADGE
    {
        // e-ink: pass the actual doom scanline number of the buffer we hold;
        // the backend does its own 320x200 -> 296x128 sampling.
        uint16_t lsl = scanvideo_scanline_number(fake_scanline_buffer.scanline_id);
        dispRenderLine(lsl, (uint16_t *) (sdata[which] + 1), 320);
    }
#else
    if (stretch) {
        dispRenderLine(asl++, (uint16_t *) (sdata[which] + 1), 320);
        // duplicate ever 6th line by simply not updating any of the other
        // state or redrawing the next time around
        if ((asl % 6) == 0) return;
    } else {
        uint16_t lsl = scanvideo_scanline_number(fake_scanline_buffer.scanline_id);
        dispRenderLine(lsl + 20, (uint16_t *) (sdata[which] + 1), 320);
    }
#endif""")

# ---- i_input.c: 6-button chord input --------------------------------------
patch("src/pico/i_input.c",
"""#ifndef NO_USE_UART
#ifdef DEFCON32_BADGE
#define NO_USE_UART 1 // not much point as there isn't one
#endif
#endif

#ifdef DEFCON32_BADGE
static const uint8_t bdef[] = {
        DEFCON32_BADGE_SW_FN_PIN, SDL_SCANCODE_LALT, SDL_SCANCODE_LALT,
        DEFCON32_BADGE_SW_START_PIN, SDL_SCANCODE_ESCAPE, SDL_SCANCODE_TAB,
        DEFCON32_BADGE_SW_SELECT_PIN, SDL_SCANCODE_RETURN, SDL_SCANCODE_1,
        DEFCON32_BADGE_SW_LEFT_PIN, SDL_SCANCODE_LEFT, SDL_SCANCODE_LEFT,
        DEFCON32_BADGE_SW_RIGHT_PIN, SDL_SCANCODE_RIGHT, SDL_SCANCODE_RIGHT,
        DEFCON32_BADGE_SW_UP_PIN, SDL_SCANCODE_UP, SDL_SCANCODE_UP,
        DEFCON32_BADGE_SW_DOWN_PIN, SDL_SCANCODE_DOWN, SDL_SCANCODE_DOWN,
        DEFCON32_BADGE_SW_A_PIN, SDL_SCANCODE_SPACE, SDL_SCANCODE_SPACE,
        DEFCON32_BADGE_SW_B_PIN, SDL_SCANCODE_LCTRL, SDL_SCANCODE_LCTRL,
};
static uint8_t buttons[count_of(bdef)/3];
static uint8_t keycodex[count_of(bdef)/3];
#include "hardware/gpio.h"
#include "doom/doomstat.h" // for menuactive
#endif
""",
"""#ifndef NO_USE_UART
#ifdef DEFCON32_BADGE
#define NO_USE_UART 1 // not much point as there isn't one
#endif
#endif

#if defined(DEFCON32_BADGE)
static const uint8_t bdef[] = {
        DEFCON32_BADGE_SW_FN_PIN, SDL_SCANCODE_LALT, SDL_SCANCODE_LALT,
        DEFCON32_BADGE_SW_START_PIN, SDL_SCANCODE_ESCAPE, SDL_SCANCODE_TAB,
        DEFCON32_BADGE_SW_SELECT_PIN, SDL_SCANCODE_RETURN, SDL_SCANCODE_1,
        DEFCON32_BADGE_SW_LEFT_PIN, SDL_SCANCODE_LEFT, SDL_SCANCODE_LEFT,
        DEFCON32_BADGE_SW_RIGHT_PIN, SDL_SCANCODE_RIGHT, SDL_SCANCODE_RIGHT,
        DEFCON32_BADGE_SW_UP_PIN, SDL_SCANCODE_UP, SDL_SCANCODE_UP,
        DEFCON32_BADGE_SW_DOWN_PIN, SDL_SCANCODE_DOWN, SDL_SCANCODE_DOWN,
        DEFCON32_BADGE_SW_A_PIN, SDL_SCANCODE_SPACE, SDL_SCANCODE_SPACE,
        DEFCON32_BADGE_SW_B_PIN, SDL_SCANCODE_LCTRL, SDL_SCANCODE_LCTRL,
};
static uint8_t buttons[count_of(bdef)/3];
static uint8_t keycodex[count_of(bdef)/3];
#include "hardware/gpio.h"
#include "doom/doomstat.h" // for menuactive
#elif defined(OUTPOST_BADGE)
#define DEFCON32_BADGE 1 // reuse the badge input state machine below
#include "pinoutOutpost.h"
#include "pico/bootrom.h"
// Six physical buttons; the missing badge buttons are chords:
//   FN     = Up + Down     (hold for strafe / FPS counter / FN combos)
//   Start  = A + B         (menu open / back)
//   Select = Left + Right  (menu select)
//   FN+B   = cycle weapons, FN+A(Start slot unused)
// virtual button order matches bdef rows: FN, START, SELECT, L, R, U, D, A, B
static const uint8_t bdef[] = {
        0, SDL_SCANCODE_LALT, SDL_SCANCODE_LALT,          // FN (U+D)
        0, SDL_SCANCODE_ESCAPE, SDL_SCANCODE_TAB,         // START (A+B)
        0, SDL_SCANCODE_RETURN, SDL_SCANCODE_RETURN,      // SELECT (L+R)
        0, SDL_SCANCODE_LEFT, SDL_SCANCODE_LEFT,
        0, SDL_SCANCODE_RIGHT, SDL_SCANCODE_RIGHT,
        0, SDL_SCANCODE_UP, SDL_SCANCODE_UP,
        0, SDL_SCANCODE_DOWN, SDL_SCANCODE_DOWN,
        0, SDL_SCANCODE_SPACE, SDL_SCANCODE_SPACE,        // A: use
        0, SDL_SCANCODE_LCTRL, SDL_SCANCODE_1,            // B: fire, FN+B: weapon
};
static uint8_t buttons[count_of(bdef)/3];
static uint8_t keycodex[count_of(bdef)/3];
static uint8_t outpost_vbtn[count_of(bdef)/3];
#include "hardware/gpio.h"
#include "doom/doomstat.h" // for menuactive

static bool outpost_btns_inited;
static void outpost_btns_init(void) {
    static const uint8_t btns[] = {
        PIN_BTN_U, PIN_BTN_D, PIN_BTN_L, PIN_BTN_R, PIN_BTN_A, PIN_BTN_B
    };
    for (unsigned i = 0; i < sizeof btns; i++) {
        gpio_init(btns[i]);
        gpio_set_dir(btns[i], GPIO_IN);
        gpio_pull_up(btns[i]);
    }
    outpost_btns_inited = true;
}
static void outpost_compute_vbtns(void) {
    // A button that took part in a chord stays "poisoned" (ignored) until it
    // is physically released, so breaking a chord doesn't fire its parts.
    static uint8_t poisoned; // bit per physical button, order U D L R A B
    uint u = !gpio_get(PIN_BTN_U), d = !gpio_get(PIN_BTN_D);
    uint l = !gpio_get(PIN_BTN_L), r = !gpio_get(PIN_BTN_R);
    uint a = !gpio_get(PIN_BTN_A), b = !gpio_get(PIN_BTN_B);
    uint fn = u && d, start = a && b, sel = l && r;
    // escape hatch: reflash without touching BOOTSEL. requires exactly
    // U+D+A+B (not L/R) so a misread all-low bus cannot trigger it.
    if (u && d && a && b && !l && !r) reset_usb_boot(0, 0);
    if (fn) poisoned |= 0x03;
    if (sel) poisoned |= 0x0c;
    if (start) poisoned |= 0x30;
    if (!u) poisoned &= ~0x01;
    if (!d) poisoned &= ~0x02;
    if (!l) poisoned &= ~0x04;
    if (!r) poisoned &= ~0x08;
    if (!a) poisoned &= ~0x10;
    if (!b) poisoned &= ~0x20;
    outpost_vbtn[0] = fn;
    outpost_vbtn[1] = start;
    outpost_vbtn[2] = sel;
    outpost_vbtn[3] = l && !(poisoned & 0x04);
    outpost_vbtn[4] = r && !(poisoned & 0x08);
    outpost_vbtn[5] = u && !(poisoned & 0x01);
    outpost_vbtn[6] = d && !(poisoned & 0x02);
    outpost_vbtn[7] = a && !(poisoned & 0x10);
    outpost_vbtn[8] = b && !(poisoned & 0x20);
}
#endif
""")

patch("src/pico/i_input.c",
"""    for(int i=0;i<count_of(bdef);i+=3) {
        uint new_sel = !gpio_get(bdef[i]);""",
"""#ifdef OUTPOST_BADGE
    if (!outpost_btns_inited) outpost_btns_init();
    outpost_compute_vbtns();
    {
        extern volatile uint32_t eink_lines_pumped, eink_frames_pushed;
        static uint32_t last_report;
        uint32_t now = time_us_32();
        if (now - last_report > 3000000) {
            last_report = now;
            printf("eink pump: %u lines, %u frames pushed\\n",
                   (unsigned) eink_lines_pumped, (unsigned) eink_frames_pushed);
        }
    }
#endif
    for(int i=0;i<count_of(bdef);i+=3) {
#ifdef OUTPOST_BADGE
        uint new_sel = outpost_vbtn[i/3];
#else
        uint new_sel = !gpio_get(bdef[i]);
#endif""")

# ---- pico CMakeLists: select display backend by board ----------------------
patch("src/pico/CMakeLists.txt",
"""add_library(common_pico INTERFACE)""",
"""if (PICO_BOARD STREQUAL "outpost_badge")
    set(DOOM_DISP_SRC ${CMAKE_CURRENT_LIST_DIR}/eink.c)
else()
    set(DOOM_DISP_SRC ${CMAKE_CURRENT_LIST_DIR}/lcd.c)
endif()

add_library(common_pico INTERFACE)""")

patch("src/pico/CMakeLists.txt",
"""        ${CMAKE_CURRENT_LIST_DIR}/lcd.c
""",
"""        ${DOOM_DISP_SRC}
""")

print("all patches applied")
