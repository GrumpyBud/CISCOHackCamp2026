# FullOS

FullOS is a tiny desktop-style firmware environment for the CUHSP / Offensive Summit ESP32 badge. It is not a general-purpose kernel; it is an Arduino-ESP32 app shell with a wallpapered desktop, mouse cursor, window chrome, settings, and built-in utilities.

## Hardware Target

- Board: CUHSP / Offensive Summit ESP32 badge, ESP32-WROOM/WROVER class
- Display: 1.44 inch 128 x 128 ST7735 TFT
- Display pins: SCLK 18, MOSI 23, CS 19, RST 25, DC 26, BL 5
- Joystick X/Y: GPIO34/GPIO35 ADC
- Joystick click: GPIO4 by default, wired active-low to GND
- IMU I2C: GPIO21/GPIO32 reserved
- Right click: capacitive touch GPIO27 by default
- LED: GPIO22
- Optional buzzer: GPIO9 / TP9, only if your badge exposes it safely

ESP32 GPIO is 3.3 V only. Do not feed 5 V into any input.

## Built-In Apps

- Settings
- About
- Calculator
- Clock
- Notes
- Paint
- Files
- GPIO Monitor
- Sensor Lab
- Logic Probe
- Scope
- Wi-Fi Scanner
- LED/Tone Tool
- Help

## Controls

- Move the joystick to move the cursor.
- Press the joystick switch for left click.
- Touch the configured capacitive pad for right click.
- Click the `x` in the top-right corner of a window to close it.
- Use Settings to calibrate the joystick, adjust pointer speed/deadzone, change touch threshold, and switch theme.

## Arduino Setup

1. Install Arduino IDE 2.x or Arduino CLI.
2. Install the Espressif `esp32` board package, Arduino-ESP32 3.x.
3. Install `TFT_eSPI` by Bodmer.
4. Copy `TFT_eSPI_User_Setup_FullOS.h` over your `TFT_eSPI/User_Setup.h`, or select it from `User_Setup_Select.h`.
5. Open `FullOS.ino`.
6. Select an ESP32 Dev Module-compatible board.
7. Compile and upload.

Arduino CLI example from the directory containing this project:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 FullOS
arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32 FullOS
```

PlatformIO is also supported:

```bash
pio run
pio run --target upload
```

## SMS / Self-Hosted Messaging

SMS is intentionally not included. An ESP32 alone cannot send real carrier SMS with no API. To self-host SMS, you need external cellular hardware such as a SIM800L, SIM7600, A7670, or similar modem, plus a SIM card/plan, antenna, a power supply that can handle modem current spikes, UART wiring, and AT-command firmware. Without a cellular modem, phone bridge, or carrier/cloud API, SMS is not available.

## Pin Changes

All firmware pin assignments live in `src/config/PinConfig.h`. Change `JOY_CLICK` and `RIGHT_CLICK_TOUCH` there if your wiring differs.

Avoid using TFT pins, GPIO21/GPIO32 IMU pins, or boot-strapping pins unless you know the badge circuit is safe for that use.

## Blank White Screen / Crash Checks

Open Serial Monitor at 115200 baud after upload. A healthy boot prints:

```text
[FullOS] boot
[FullOS] pins ready
[FullOS] settings ready
[FullOS] display ready
```

On first boot the screen should briefly flash red, green, blue, then show the desktop. If it stays white and Serial reaches `display ready`, TFT_eSPI is almost certainly using the wrong display setup; copy `TFT_eSPI_User_Setup_FullOS.h` over the library's `User_Setup.h`.

GPIO21 and GPIO32 are reserved for the IMU on this badge and are not used for joystick click or sensor sampling. GPIO11 is avoided because it can be flash-related on ESP32 modules, and GPIO33 is not used.
