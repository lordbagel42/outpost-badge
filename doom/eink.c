/*
 * SSD1680 e-ink display backend for rp2040-doom on the Outpost badge.
 *
 * Implements the same interface as lcd.c (lcd.h): the doom renderer pumps
 * 320-pixel RGB scanlines through dispRenderLine(); we dither them into a
 * 1-bit 296x128 framebuffer and push complete frames to the panel with the
 * badge firmware's fast-partial-refresh path (custom short LUT, charge pump
 * held up, old-RAM kept in sync).
 *
 * The scanline pump is self-paced with a hardware timer alarm: each
 * dispRenderLine() call arms the alarm, whose IRQ calls fill_scanlines()
 * again (on the DEFCON32 LCD this role was played by the line-DMA IRQ).
 *
 * Waveform setting: tpa=2, frame_rate=0x44, groups=1 -> ~80ms panel time,
 * measured 11.5 fps on this panel ("slightly worse" contrast than the
 * 9.4 fps milestone setting; see the badge repo epaper/README.md).
 * Dropping the group-1 hold pulse also removes the static-pixel bias, so
 * this is the panel-safe end of the fast settings.
 */

#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "hardware/spi.h"
#include "hardware/i2c.h"
#include "hardware/gpio.h"
#include "hardware/irq.h"
#include "hardware/structs/timer.h"
#include "pinoutOutpost.h"
#include "lcd.h"
#include "doom/doomstat.h"      // brightnessLevel
#include "badge_image.h"        // static name-badge (296x128, fb_accum layout)

#define EPD_SPI         spi1
#define EPD_BAUD        20000000

// Panel geometry: RAM rows run along the 296 axis; 128 bits per row.
#define EPD_COLS        128
#define EPD_ROWS        296
#define EPD_STRIDE      (EPD_COLS / 8)          // 16 bytes per row
#define EPD_BUFLEN      (EPD_STRIDE * EPD_ROWS) // 4736 bytes

// Doom source frame
#define SRC_W           320
#define SRC_H           200

// Scanline pump period. 150us x 200 lines = 30ms/frame (~33 fps pump),
// same ballpark as the DEFCON32 LCD line rate.
#define LINE_US         150

// Waveshare WF_PARTIAL for the SSD1680 (153 LUT bytes + 6 config bytes),
// same table as the badge firmware's ssd1680.py.
static const uint8_t wf_partial[159] = {
    0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x0A, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x00, 0x00, 0x00,
    0x22, 0x17, 0x41, 0xB0, 0x32, 0x36,
};

// speed/contrast trade (see epaper/README.md in the badge repo)
#define WF_TPA          2       // group 0 drive frames
#define WF_FRAME_RATE   0x44
#define WF_GROUPS       3       // keep both hold pulses: 9.4fps "milestone" contrast

// Post-process for clarity: linear contrast stretch around mid-gray applied to
// luma BEFORE the ordered dither. Ordered (Bayer) dither is temporally stable,
// so static pixels stay identical frame-to-frame (no shimmer/extra ghosting) --
// unlike error diffusion. gain = EINK_CONTRAST_NUM / (1 << EINK_CONTRAST_SHIFT).
#define EINK_CONTRAST_NUM   3
#define EINK_CONTRAST_SHIFT 1   // 3>>1 = 1.5x
#define EINK_LUMA_MID       124 // midpoint of the 0..248 luma range

static uint8_t fb_accum[EPD_BUFLEN];    // dither target (bit 1 = white)
static uint8_t fb_sent[EPD_BUFLEN];     // snapshot on the panel / in old RAM

static volatile enum { EPD_IDLE, EPD_UPDATING } epd_state;
static volatile bool frame_dirty;       // a complete new frame is in fb_accum
static int dither_bias;                 // from dispSetBrightness()

// source-line -> target-row map: 0xFF = line not sampled
static uint8_t line_target[SRC_H];
// target-column -> source-pixel map
static uint16_t xmap[EPD_ROWS];

static const uint8_t bayer4[16] = {
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
};

extern void fill_scanlines(void);

// debug counters, printed from the core-0 input poll
volatile uint32_t eink_lines_pumped, eink_frames_pushed;

// set by the core-0 input poll (hold U+R+A+B >3s); serviced in epd_poll on
// core 1: do one full-strength panel reset to wipe accumulated ghosting.
volatile uint8_t eink_clear_request;

// name-badge takeover ("kill Doom"): 1 = show the static badge, 0 = play Doom.
// Defaults to 1 so the badge is what shows on boot; toggled by the core-0 input
// poll (hold L+R+A+B >3s) and serviced in epd_poll.
volatile uint8_t eink_badge_mode = 1;
// dark-mode badge: 1 = inverted (black bg / white art). Double-tap A in badge
// mode toggles it; eink_badge_redraw asks epd_poll to repaint.
volatile uint8_t eink_badge_invert;
volatile uint8_t eink_badge_redraw;

// light/dark for the Doom view: 0 = normal, 1 = inverted. Toggled by the core-0
// input poll (hold UP + triple-tap A); Doom frames pick it up on the next pump.
volatile uint8_t eink_invert;

// chord-list overlay: 1 = show the help screen. Toggled by DOWN + triple-tap A.
volatile uint8_t eink_help_mode;

// verify the flashed WHX region before anything parses it (called from i_main)
void outpost_wad_check(void) {
#ifdef TINY_WAD_ADDR
    const uint8_t *w = (const uint8_t *) TINY_WAD_ADDR;
    uint32_t sum = 0;
    for (uint32_t i = 0; i < 1800344; i++) sum = sum * 31 + w[i];
    printf("WAD region: %02x %02x %02x %02x checksum %08x\n",
           w[0], w[1], w[2], w[3], (unsigned) sum);
#endif
}

// ---- NFC: program the ST25DV04K so a phone scan opens the URL --------------
// One-shot at boot: write an NDEF URI record to the tag EEPROM over I2C
// (GP10 SDA / GP11 SCL = i2c1). Untested silicon per firmware/README, so it
// probes first and skips quietly if the tag does not answer.
#define NFC_I2C      i2c1
#define NFC_SDA_PIN  10
#define NFC_SCL_PIN  11
#define ST25DV_ADDR  0x53               // user-memory I2C device address (7-bit)

static bool st25dv_write_byte(uint16_t addr, uint8_t v) {
    uint8_t buf[3] = { (uint8_t)(addr >> 8), (uint8_t) addr, v };
    if (i2c_write_blocking(NFC_I2C, ST25DV_ADDR, buf, 3, false) < 0) return false;
    // EEPROM write cycle (tW <= 5 ms): ACK-poll until the device answers again
    absolute_time_t dl = make_timeout_time_ms(20);
    uint8_t t;
    while (!time_reached(dl))
        if (i2c_read_blocking(NFC_I2C, ST25DV_ADDR, &t, 1, false) >= 0) return true;
    return false;
}

static void outpost_nfc_init(void) {
    static bool done;
    if (done) return;
    done = true;
    i2c_init(NFC_I2C, 100 * 1000);
    gpio_set_function(NFC_SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(NFC_SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(NFC_SDA_PIN);
    gpio_pull_up(NFC_SCL_PIN);
    // capability container + one URI record for https://link.raygen.dev
    static const uint8_t ndef[] = {
        0xE1, 0x40, 0x40, 0x00,             // T5T capability container
        0x03, 0x14,                         // NDEF-message TLV, length 20
        0xD1, 0x01, 0x10, 0x55, 0x04,       // URI record, well-known 'U', https:// prefix
        'l','i','n','k','.','r','a','y','g','e','n','.','d','e','v',
        0xFE                                // terminator TLV
    };
    uint8_t probe;
    if (i2c_read_blocking(NFC_I2C, ST25DV_ADDR, &probe, 1, false) < 0) {
        printf("nfc: ST25DV not responding on i2c1\n");
        return;
    }
    for (uint16_t i = 0; i < sizeof ndef; i++)
        if (!st25dv_write_byte(i, ndef[i])) { printf("nfc: write failed @%u\n", (unsigned) i); return; }
    printf("nfc: NDEF written -> https://link.raygen.dev\n");
}

// ---- low-level panel access -------------------------------------------

static void __not_in_flash_func(epd_cmd)(uint8_t cmd, const uint8_t *data, size_t n) {
    gpio_put(PIN_EPD_DC, 0);
    gpio_put(PIN_EPD_CS, 0);
    spi_write_blocking(EPD_SPI, &cmd, 1);
    gpio_put(PIN_EPD_CS, 1);
    if (n) {
        gpio_put(PIN_EPD_DC, 1);
        gpio_put(PIN_EPD_CS, 0);
        spi_write_blocking(EPD_SPI, data, n);
        gpio_put(PIN_EPD_CS, 1);
    }
}

static void epd_cmd1(uint8_t cmd, uint8_t d0) { epd_cmd(cmd, &d0, 1); }

static inline bool epd_busy(void) { return gpio_get(PIN_EPD_BUSY); }

static void epd_wait(void) {
    absolute_time_t deadline = make_timeout_time_ms(15000);
    while (epd_busy() && !time_reached(deadline)) tight_loop_contents();
}

static void epd_reset(void) {
    gpio_put(PIN_EPD_RST, 1); busy_wait_ms(20);
    gpio_put(PIN_EPD_RST, 0); busy_wait_ms(5);
    gpio_put(PIN_EPD_RST, 1); busy_wait_ms(20);
    epd_wait();
}

static void epd_set_window_full(void) {
    static const uint8_t xw[2] = { 0, EPD_STRIDE - 1 };
    static const uint8_t yw[4] = { 0, 0, (EPD_ROWS - 1) & 0xFF, (EPD_ROWS - 1) >> 8 };
    static const uint8_t zero1[1] = { 0 };
    static const uint8_t zero2[2] = { 0, 0 };
    epd_cmd(0x44, xw, 2);
    epd_cmd(0x45, yw, 4);
    epd_cmd(0x4E, zero1, 1);
    epd_cmd(0x4F, zero2, 2);
}

static void epd_init_regs(void) {
    epd_reset();
    epd_cmd(0x12, NULL, 0);             // SW reset -> factory LUT from OTP
    epd_wait();
    {
        const uint8_t d[3] = { (EPD_ROWS - 1) & 0xFF, (EPD_ROWS - 1) >> 8, 0x00 };
        epd_cmd(0x01, d, 3);            // driver output control
    }
    epd_cmd1(0x11, 0x03);               // data entry: X inc, Y inc
    epd_set_window_full();
    epd_cmd1(0x3C, 0x05);               // border waveform
    epd_cmd1(0x18, 0x80);               // internal temperature sensor
    {
        const uint8_t d[2] = { 0x00, 0x80 };
        epd_cmd(0x21, d, 2);            // display update control 1
    }
    epd_wait();
}

static void epd_load_lut(void) {
    uint8_t lut[159];
    memcpy(lut, wf_partial, sizeof lut);
    lut[60] = WF_TPA;                   // group 0 phase-A frame count
    for (int i = 144; i < 150; i++) lut[i] = WF_FRAME_RATE;
    if (WF_GROUPS < 3) lut[60 + 14] = 0;
    if (WF_GROUPS < 2) lut[60 + 7] = 0;
    epd_cmd(0x32, lut, 153);
    epd_cmd1(0x3F, lut[153]);
    epd_cmd1(0x03, lut[154]);           // gate voltage
    epd_cmd(0x04, &lut[155], 3);        // source VSH1/VSH2/VSL
    epd_cmd1(0x2C, lut[158]);           // VCOM
    epd_wait();
}

// arm_partial(): reset, load short LUT, bring the charge pump up ONCE.
// After this, each frame is a display-only update (0x22=0x0C).
static void epd_arm_partial(void) {
    gpio_put(PIN_EPD_RST, 0); busy_wait_us(2000);
    gpio_put(PIN_EPD_RST, 1); busy_wait_us(2000);
    {
        const uint8_t d[3] = { (EPD_ROWS - 1) & 0xFF, (EPD_ROWS - 1) >> 8, 0x00 };
        epd_cmd(0x01, d, 3);
    }
    epd_cmd1(0x11, 0x03);
    epd_load_lut();
    {
        const uint8_t d[10] = { 0, 0, 0, 0, 0, 0x40, 0, 0, 0, 0 };
        epd_cmd(0x37, d, 10);
    }
    epd_cmd1(0x3C, 0x80);
    epd_cmd1(0x22, 0xC0);               // enable clock + analog, no display
    epd_cmd(0x20, NULL, 0);
    epd_wait();
}

// full-strength white refresh that also seeds old RAM (display_base)
static void epd_base_white(void) {
    memset(fb_accum, 0xFF, EPD_BUFLEN);
    memset(fb_sent, 0xFF, EPD_BUFLEN);
    epd_set_window_full();
    epd_cmd(0x24, fb_sent, EPD_BUFLEN);
    epd_set_window_full();
    epd_cmd(0x26, fb_sent, EPD_BUFLEN);
    epd_cmd1(0x22, 0xF7);
    epd_cmd(0x20, NULL, 0);
    epd_wait();                          // ~2.3 s, once at boot
}

// ---- frame push state machine ------------------------------------------

// one full-strength refresh to `buf` (factory LUT, sets only new RAM like the
// reference display_full -- setting old==new makes the controller skip
// unchanged pixels, which leaves ghosts).
static void epd_full_refresh(const uint8_t *buf) {
    epd_set_window_full();
    epd_cmd(0x24, buf, EPD_BUFLEN);
    epd_cmd1(0x22, 0xF7);
    epd_cmd(0x20, NULL, 0);
    epd_wait();
}

// strong two-pass clear (drive every pixel black, then white) to shake out
// accumulated ghosting; leaves the panel white with old RAM seeded white.
// Caller must have run epd_init_regs() first (factory LUT).
static void epd_clear_panel(void) {
    memset(fb_sent, 0x00, EPD_BUFLEN); epd_full_refresh(fb_sent);   // all black
    memset(fb_sent, 0xFF, EPD_BUFLEN); epd_full_refresh(fb_sent);   // all white
    memset(fb_accum, 0xFF, EPD_BUFLEN);
    epd_set_window_full();
    epd_cmd(0x26, fb_sent, EPD_BUFLEN);                             // old RAM = white
}

// deep recondition: N balanced black/white full-refresh inversions to clear
// ghosting and regional one-way bias (firmware version of recondition.py).
// Caller runs epd_init_regs() first; ends white with old RAM seeded white.
#define RECOND_CYCLES 6
static void epd_recondition(void) {
    for (int i = 0; i < RECOND_CYCLES; i++) {
        memset(fb_sent, 0x00, EPD_BUFLEN); epd_full_refresh(fb_sent);   // black
        memset(fb_sent, 0xFF, EPD_BUFLEN); epd_full_refresh(fb_sent);   // white
    }
    memset(fb_accum, 0xFF, EPD_BUFLEN);
    epd_set_window_full();
    epd_cmd(0x26, fb_sent, EPD_BUFLEN);
}

// paint the badge (light, or inverted for dark mode) with one full refresh.
static void epd_redraw_badge(void) {
    // border region (0x3C) can't be addressed by the image -> drive it black in
    // dark mode so it doesn't leave a white frame; white (0x05) in light mode.
    epd_cmd1(0x3C, eink_badge_invert ? 0x00 : 0x05);
    for (unsigned i = 0; i < EPD_BUFLEN; i++)
        fb_sent[i] = eink_badge_invert ? (uint8_t) ~badge_image[i] : badge_image[i];
    memcpy(fb_accum, fb_sent, EPD_BUFLEN);
    epd_full_refresh(fb_sent);
    epd_set_window_full();
    epd_cmd(0x26, fb_sent, EPD_BUFLEN); // old RAM = what's shown
}

// "kill Doom": clear the panel hard, then draw the static badge.
static void epd_show_badge(void) {
    epd_init_regs();                    // SW reset -> factory LUT from OTP
    epd_clear_panel();                  // wipe Doom's ghost (incl. the status bar)
    epd_redraw_badge();                 // light or dark per eink_badge_invert
}

// leaving badge mode: clear the badge off the panel, then re-arm fast partial
// so Doom redraws onto a clean white field.
static void epd_resume_doom(void) {
    epd_init_regs();
    epd_clear_panel();                  // wipe the badge (else it ghosts under Doom)
    epd_arm_partial();                  // charge pump up, short LUT reloaded
}

// ---- chord-list help overlay (DOWN + triple-tap A) ------------------------
// Tiny 5x7 font, black ink on white. Screen x runs along the 296 axis, y along
// the 128 axis, with the same FLIP_X mapping as the Doom/badge render path.
static const uint8_t help_font[][7] = {
    {0,0,0,0,0,0,0},                                 // ' '
    {0x1E,0x01,0x01,0x0E,0x01,0x01,0x1E},            // '3'
    {0x00,0x04,0x04,0x1F,0x04,0x04,0x00},            // '+'
    {0x01,0x01,0x02,0x04,0x08,0x10,0x10},            // '/'
    {0x0E,0x11,0x11,0x1F,0x11,0x11,0x11},            // 'A'
    {0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E},            // 'B'
    {0x0E,0x11,0x10,0x10,0x10,0x11,0x0E},            // 'C'
    {0x1C,0x12,0x11,0x11,0x11,0x12,0x1C},            // 'D'
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F},            // 'E'
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x10},            // 'F'
    {0x0E,0x11,0x10,0x17,0x11,0x11,0x0F},            // 'G'
    {0x11,0x11,0x11,0x1F,0x11,0x11,0x11},            // 'H'
    {0x1F,0x04,0x04,0x04,0x04,0x04,0x1F},            // 'I'
    {0x11,0x12,0x14,0x18,0x14,0x12,0x11},            // 'K'
    {0x10,0x10,0x10,0x10,0x10,0x10,0x1F},            // 'L'
    {0x11,0x1B,0x15,0x15,0x11,0x11,0x11},            // 'M'
    {0x11,0x11,0x19,0x15,0x13,0x11,0x11},            // 'N'
    {0x0E,0x11,0x11,0x11,0x11,0x11,0x0E},            // 'O'
    {0x1E,0x11,0x11,0x1E,0x10,0x10,0x10},            // 'P'
    {0x1E,0x11,0x11,0x1E,0x14,0x12,0x11},            // 'R'
    {0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E},            // 'S'
    {0x1F,0x04,0x04,0x04,0x04,0x04,0x04},            // 'T'
    {0x11,0x11,0x11,0x11,0x11,0x11,0x0E},            // 'U'
    {0x11,0x11,0x11,0x15,0x15,0x1B,0x11},            // 'W'
    {0x04,0x0E,0x1F,0x04,0x04,0x04,0x04},            // up    '\1'
    {0x04,0x04,0x04,0x04,0x1F,0x0E,0x04},            // down  '\2'
    {0x04,0x0C,0x1F,0x0C,0x04,0x00,0x00},            // left  '\3'
    {0x04,0x06,0x1F,0x06,0x04,0x00,0x00},            // right '\4'
};
static const char help_idx[] = " 3+/ABCDEFGHIKLMNOPRSTUW";  // parallel to help_font

static const uint8_t *help_glyph(char c) {
    if ((uint8_t) c >= 1 && (uint8_t) c <= 4) return help_font[24 + (uint8_t) c - 1];
    for (int i = 0; help_idx[i]; i++) if (help_idx[i] == c) return help_font[i];
    return help_font[0];
}
static void help_draw_char(uint8_t *buf, int ox, int oy, char c) {
    const uint8_t *g = help_glyph(c);
    for (int ry = 0; ry < 7; ry++)
        for (int rx = 0; rx < 5; rx++)
            if (g[ry] & (0x10 >> rx)) {
                int sx = ox + rx, sy = oy + ry;
                if (sx < 0 || sx >= EPD_ROWS || sy < 0 || sy >= EPD_COLS) continue;
                uint idx = (EPD_ROWS - 1 - sx) * EPD_STRIDE + (sy >> 3);
                buf[idx] &= ~(0x80 >> (sy & 7));   // black ink (bit 1 = white)
            }
}
static void help_draw_str(uint8_t *buf, int ox, int oy, const char *s) {
    for (; *s; s++, ox += 6) help_draw_char(buf, ox, oy, *s);
}
static void help_render(uint8_t *buf) {
    static const char *const lines[] = {
        "CHORDS",
        "\1 FWD   \2 BACK",
        "\3 \4 TURN",
        "A USE   B FIRE",
        "\1\2 STRAFE  +B WEAPON",
        "\3\4 MENU",
        "\1\4 AB 3S RESET",
        "\3\4 AB 3S BADGE",
        "\1\2 AB BOOTSEL",
        "\1 +AAA LIGHT/DARK",
        "\2 +AAA THIS LIST",
    };
    memset(buf, 0xFF, EPD_BUFLEN);
    int oy = 3;
    for (unsigned i = 0; i < sizeof lines / sizeof lines[0]; i++, oy += 11)
        help_draw_str(buf, 4, oy, lines[i]);
}

// clear the panel and show the chord list; held until DOWN + triple-tap A again.
static void epd_show_help(void) {
    epd_init_regs();
    epd_clear_panel();
    epd_cmd1(0x3C, (eink_invert & 1) ? 0x00 : 0x05);   // border matches polarity
    help_render(fb_sent);
    if (eink_invert & 1)
        for (unsigned i = 0; i < EPD_BUFLEN; i++) fb_sent[i] ^= 0xFF;
    memcpy(fb_accum, fb_sent, EPD_BUFLEN);
    epd_full_refresh(fb_sent);
    epd_set_window_full();
    epd_cmd(0x26, fb_sent, EPD_BUFLEN);
}

static void __not_in_flash_func(epd_poll)(void) {
    static uint8_t badge_shown;
    static uint8_t help_shown;
    if (eink_help_mode) {               // chord-list overlay takes over the panel
        if (!help_shown) {
            if (epd_state == EPD_UPDATING) { if (epd_busy()) return; epd_state = EPD_IDLE; }
            epd_show_help();
            help_shown = 1;
        }
        return;
    }
    if (help_shown) {                   // leaving help -> back to badge or Doom
        help_shown = 0;
        if (eink_badge_mode) badge_shown = 0;   // force the badge to repaint below
        else { epd_resume_doom(); epd_state = EPD_IDLE; frame_dirty = false; }
    }
    if (eink_badge_mode) {              // "kill Doom": show the static badge, hold it
        if (!badge_shown) {
            if (epd_state == EPD_UPDATING) { if (epd_busy()) return; epd_state = EPD_IDLE; }
            epd_show_badge();
            badge_shown = 1;
            eink_badge_redraw = 0;
        } else if (eink_badge_redraw) { // UP + triple-tap A toggled dark mode -> repaint
            eink_badge_redraw = 0;
            epd_redraw_badge();
        }
        return;
    }
    if (badge_shown) {                  // leaving badge mode -> resume Doom
        epd_resume_doom();
        epd_state = EPD_IDLE;
        frame_dirty = false;
        badge_shown = 0;
    }
    if (epd_state == EPD_UPDATING) {
        if (epd_busy()) return;
        // update done: bring old RAM in sync so static pixels stay undriven
        epd_set_window_full();
        epd_cmd(0x26, fb_sent, EPD_BUFLEN);
        epd_state = EPD_IDLE;
    }
    if (epd_state == EPD_IDLE && eink_clear_request) {
        eink_clear_request = 0;
        // firmware recondition (hold U+R+A+B): balanced black/white inversions to
        // clear ghosting AND regional one-way bias (the "rough bottom"), then
        // re-arm the fast partial path so Doom redraws clean. ~28 s.
        epd_init_regs();      // SW reset -> factory LUT from OTP
        epd_recondition();    // RECOND_CYCLES balanced inversions, ends white
        epd_arm_partial();    // reload short custom LUT, charge pump back up
        frame_dirty = false;  // drop stale frame; the pump redraws the live scene
        return;
    }
    if (epd_state == EPD_IDLE && frame_dirty) {
        frame_dirty = false;
        eink_frames_pushed++;
        memcpy(fb_sent, fb_accum, EPD_BUFLEN);
        epd_set_window_full();
        epd_cmd(0x24, fb_sent, EPD_BUFLEN);
        epd_cmd1(0x22, 0x0C);           // display-only, DISPLAY Mode 2
        epd_cmd(0x20, NULL, 0);
        epd_state = EPD_UPDATING;
    }
}

// ---- scanline pump -------------------------------------------------------

static void __not_in_flash_func(eink_alarm_irq)(void) {
    timer0_hw->intr = 1u << EINK_ALARM_NUM;
    fill_scanlines();
}

static inline void arm_pump(uint32_t us) {
    timer0_hw->alarm[EINK_ALARM_NUM] = timer0_hw->timerawl + us;
}

void dispWaitLine(void) {
}

// y: doom scanline 0..199; buf: 320 pixels, 5:5:5 at shifts 11/6/0
void __not_in_flash_func(dispRenderLine)(uint y, uint16_t *buf, uint32_t width) {
    uint ty = line_target[y < SRC_H ? y : SRC_H - 1];
    if (!eink_badge_mode && !eink_help_mode && ty != 0xFF) {
        const uint8_t *brow = &bayer4[(ty & 3) * 4];
        int bias = dither_bias;
        for (uint tx = 0; tx < EPD_ROWS; tx++) {
            uint16_t p = buf[xmap[tx]];
            int r = (p >> 11) & 31, g = (p >> 6) & 31, b = p & 31;
            int luma = (r * 77 + g * 151 + b * 28) >> 5;    // 0..248
            // contrast stretch around mid-gray for a crisper 1-bit image
            luma = EINK_LUMA_MID +
                   (((luma - EINK_LUMA_MID) * EINK_CONTRAST_NUM) >> EINK_CONTRAST_SHIFT);
            int t = brow[tx & 3] * 16 + 8;
            // screen x -> panel row 295-x (FLIP_X, matches the badge firmware)
            uint idx = (EPD_ROWS - 1 - tx) * EPD_STRIDE + (ty >> 3);
            uint8_t m = 0x80 >> (ty & 7);
            if ((luma + bias >= t) ^ (eink_invert & 1))
                fb_accum[idx] |= m;     // white
            else
                fb_accum[idx] &= ~m;
        }
    }
    epd_poll();                          // finish an update the moment BUSY drops
    eink_lines_pumped++;
    if (y == SRC_H - 1)
        frame_dirty = true;              // fb_accum now holds a complete frame
    arm_pump(LINE_US);
}

// ---- lcd.h interface ------------------------------------------------------

void gpiosConfig(bool firstTime) {
    (void) firstTime;
    static const uint8_t outs[] = { PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST };
    for (unsigned i = 0; i < sizeof outs; i++) {
        gpio_init(outs[i]);
        gpio_put(outs[i], 1);
        gpio_set_dir(outs[i], GPIO_OUT);
    }
    gpio_init(PIN_EPD_BUSY);
    gpio_set_dir(PIN_EPD_BUSY, GPIO_IN);
    static const uint8_t btns[] = {
        PIN_BTN_U, PIN_BTN_D, PIN_BTN_L, PIN_BTN_R, PIN_BTN_A, PIN_BTN_B
    };
    for (unsigned i = 0; i < sizeof btns; i++) {
        gpio_init(btns[i]);
        gpio_set_dir(btns[i], GPIO_IN);
        gpio_pull_up(btns[i]);          // switch-to-ground, active low
    }
}

void dispInit(int fps) {
    (void) fps;
    printf("eink: dispInit\n");
    outpost_nfc_init();                  // program the NFC tag once at boot
    // sampling maps
    memset(line_target, 0xFF, sizeof line_target);
    for (uint ty = 0; ty < EPD_COLS; ty++)
        line_target[ty * SRC_H / EPD_COLS] = ty;
    for (uint tx = 0; tx < EPD_ROWS; tx++)
        xmap[tx] = tx * SRC_W / EPD_ROWS;

    spi_init(EPD_SPI, EPD_BAUD);
    gpio_set_function(PIN_EPD_SCK, GPIO_FUNC_SPI);
    gpio_set_function(PIN_EPD_MOSI, GPIO_FUNC_SPI);

    dispSetBrightness((uint8_t) brightnessLevel);

    epd_init_regs();
    // Boot defaults to the name badge (eink_badge_mode = 1): the first epd_poll
    // runs epd_show_badge(), which does the boot clean (black->white) and draws
    // the badge. Doom re-arms fast partial via epd_resume_doom() on the L+R+A+B
    // toggle, so no base_white / arm_partial is needed here.
    epd_state = EPD_IDLE;
    frame_dirty = false;

    // scanline pump alarm (this runs on core 1: IRQ enable is per-core)
    irq_set_exclusive_handler(TIMER0_IRQ_0 + EINK_ALARM_NUM, eink_alarm_irq);
    hw_set_bits(&timer0_hw->inte, 1u << EINK_ALARM_NUM);
    irq_set_enabled(TIMER0_IRQ_0 + EINK_ALARM_NUM, true);

    printf("e-ink display initialised (tpa=%d rate=0x%02x groups=%d)\n",
           WF_TPA, WF_FRAME_RATE, WF_GROUPS);
}

void dispOn(void) {
}

void dispSetBrightness(uint_fast8_t bri) {
    // menu brightness 0..15 -> dither luma bias
    dither_bias = ((int) bri - 8) * 12;
}
