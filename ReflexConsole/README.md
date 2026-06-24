# Reflex Console

An ESP32 handheld for quick reaction, attention, choice, and rhythm tests. It tracks your own baseline and shows a simple readiness estimate. It is a measurement tool, not an IQ test or medical device.

## Requirements

- CUHSP 2021 ESP32 badge (or compatible ESP32)
- 128×128 ST7735 TFT
- Arduino-ESP32 3.3.10
- TFT_eSPI

Configure TFT_eSPI for the badge:

```cpp
#define ST7735_DRIVER
#define TFT_WIDTH 128
#define TFT_HEIGHT 128
#define ST7735_GREENTAB3
#define TFT_RGB_ORDER TFT_BGR
#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS 19
#define TFT_DC 26
#define TFT_RST 25
#define TFT_BL 5
```

Open `ReflexConsole.ino` in Arduino IDE, select your ESP32 board, and upload.

## Pin map

| Function | GPIO |
|---|---:|
| TFT SCLK / MOSI / CS | 18 / 23 / 19 |
| TFT DC / RST / backlight | 26 / 25 / 5 |
| LED | 22 (built in) |
| Up / Down / Left / Right touch | 2 / 15 / 4 / 13 |
| Select / Back / Start / Menu touch | 12 / 14 / 27 / 33 |

The tester uses only the badge's built-in display, LED, and capacitive pads; it needs no joystick, buzzer, or other wiring. All GPIO is 3.3 V only.

Touch-pad mapping follows an Xbox-style layout: S2 = Up, S3 = Down, S0 = Left, S4 = Right; S5 = A/Select, S6 = B/Back, S8 = X/Menu, and S7 = Y/Start.

## Use

- Touch Up/Down navigates menus; Left/Right changes a setting.
- Touch Select or Start activates an item and responds in reaction tests.
- Back returns to the menu; it is also the left response in Choice Test.
- Menu always returns to the main menu.

Modes:

- **Quick Test:** simple reaction time; detects false starts and lapses.
- **Focus Test:** repeated reaction events over 30, 60, or 120 seconds.
- **Choice Test:** blue = Back/left; red = Select/right.
- **Rhythm Test:** tap along with 24 beats.

The first five Quick Tests create a personal baseline. After that, readiness reflects reaction speed, consistency, lapses, and false starts relative to that baseline. It is a personal trend, not a diagnosis or comparison with other people.

Settings persist in ESP32 Preferences. Use Settings to change sound, LED, test duration, trial count, lapse threshold, or reset saved data.

## Troubleshooting

- Blank or incorrect display: check the TFT_eSPI setup above.
- Joystick drift: keep it centered during boot; adjust the dead zone in `InputManager.cpp` if necessary.
- Touch unreliable: adjust the threshold in `InputManager.cpp`.
- No buzzer: set `ENABLE_BUZZER` to `0` in `BuildConfig.h` if no buzzer is fitted.
