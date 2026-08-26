#ifndef _PINOUT_OUTPOST_H_
#define _PINOUT_OUTPOST_H_

// Outpost badge (RP2354A + SSD1680 2.9" e-ink), pin map from the badge
// firmware README / KiCad netlist.

#define PIN_EPD_CS      13
#define PIN_EPD_SCK     14      // SPI1 SCK
#define PIN_EPD_MOSI    15      // SPI1 TX
#define PIN_EPD_BUSY    16      // high = busy
#define PIN_EPD_DC      17
#define PIN_EPD_RST     18      // active low

#define PIN_BTN_U       7
#define PIN_BTN_L       8
#define PIN_BTN_R       6
#define PIN_BTN_D       9
#define PIN_BTN_A       5
#define PIN_BTN_B       4

// hardware alarm used to pace the scanline pump (alarm pool is disabled)
#define EINK_ALARM_NUM  3

#endif
