/*
 * Outpost badge: RP2354A (RP2350A with 2MB stacked internal flash),
 * SSD1680 2.9" e-ink, six buttons. Based on pico2.h.
 */

// -----------------------------------------------------
// NOTE: THIS HEADER IS ALSO INCLUDED BY ASSEMBLER SO
//       SHOULD ONLY CONSIST OF PREPROCESSOR DIRECTIVES
// -----------------------------------------------------

// pico_cmake_set PICO_PLATFORM=rp2350

#ifndef _BOARDS_OUTPOST_BADGE_H
#define _BOARDS_OUTPOST_BADGE_H

// For board detection
#define OUTPOST_BADGE

// --- RP2350 VARIANT ---
#define PICO_RP2350A 1

// --- UART --- (GP0/GP1 are broken out on the perfboard header)
#ifndef PICO_DEFAULT_UART
#define PICO_DEFAULT_UART 0
#endif
#ifndef PICO_DEFAULT_UART_TX_PIN
#define PICO_DEFAULT_UART_TX_PIN 0
#endif
#ifndef PICO_DEFAULT_UART_RX_PIN
#define PICO_DEFAULT_UART_RX_PIN 1
#endif

// --- I2C --- (unconnected header pins; piconet multiplayer wants a default)
#ifndef PICO_DEFAULT_I2C
#define PICO_DEFAULT_I2C 0
#endif
#ifndef PICO_DEFAULT_I2C_SDA_PIN
#define PICO_DEFAULT_I2C_SDA_PIN 28
#endif
#ifndef PICO_DEFAULT_I2C_SCL_PIN
#define PICO_DEFAULT_I2C_SCL_PIN 29
#endif

// --- AUDIO --- (no speaker on this badge; PWM goes to an unused pin)
#ifndef PICO_AUDIO_PWM_L_PIN
#define PICO_AUDIO_PWM_L_PIN 27
#endif
#ifndef PICO_AUDIO_PWM_MONO_PIN
#define PICO_AUDIO_PWM_MONO_PIN 27
#endif

// --- FLASH --- 2MB internal (stacked die), standard BOOTSEL bootloader
#define PICO_BOOT_STAGE2_CHOOSE_W25Q080 1

#ifndef PICO_FLASH_SPI_CLKDIV
#define PICO_FLASH_SPI_CLKDIV 2
#endif

#ifndef PICO_FLASH_SIZE_BYTES
#define PICO_FLASH_SIZE_BYTES (2 * 1024 * 1024)
#endif

#ifndef PICO_RP2350_A2_SUPPORTED
#define PICO_RP2350_A2_SUPPORTED 1
#endif

#endif
