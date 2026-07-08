# Reflex Console

An ESP32 handheld for quick reaction, attention, choice, rhythm, and memory tests. It tracks your own baseline and shows a simple readiness estimate.

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
| Optional buzzer | 32 / TP9 |

The tester uses the badge's built-in display, LED, and capacitive pads, so it needs no joystick or extra input wiring. Sound feedback is enabled in `src/config/BuildConfig.h` and expects an optional buzzer on GPIO32/TP9. Disable `ENABLE_BUZZER` if no buzzer is wired, or turn it off in the app settings UI. All GPIO is 3.3 V only.

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
- **Rhythm Test:** tap along with 24 flashes, 600 ms apart. Each tap is matched to its nearest flash; only the first tap matched to a flash counts. Timing error is the median absolute distance from a matched flash.
- **Memory Test:** watch a short Up/Down/Left/Right sequence and repeat it using the touch pads. The sequence adapts over five rounds, then logs recall accuracy, recall timing, mistakes, score, and best completed span. A perfect 3-to-7 span run scores 100; late misses still receive credit for reached difficulty.

The first five Quick Tests create a personal baseline. After that, readiness reflects reaction speed, consistency, lapses, and false starts relative to that baseline. It is a personal trend, not a diagnosis or comparison with other people.

## Stats, storage, and versioning

Settings and statistics are stored in the ESP32's non-volatile Preferences namespace (`reflex`) after every completed session. They survive reset and ordinary firmware uploads; erase-flash operations and **Reset stats** remove them.

- **Last score** is the score from the most recently completed session, regardless of test mode.
- **Best quick** is the fastest non-zero median reaction time from a completed Quick Test. Focus, Choice, and Rhythm sessions do not change it.
- **Baseline median** and **Baseline spread** are the moving Quick Test baseline used for readiness. A session with no valid response is recorded in the session count, but cannot overwrite the best or baseline with a zero.
- **Sessions** counts every completed test.
- **Detailed history** retains the newest 100 completed sessions. It is separate from the existing aggregate storage, so updating from older firmware preserves aggregate stats while starting detailed history empty. **Reset stats** clears both local aggregates and local detailed history; **Reset baseline** does not clear session history.
- **Memory best** is the highest on-device Memory Test span reached in a completed session.

The boot-screen version is the `FIRMWARE_VERSION` value in `src/config/BuildConfig.h`. It is intentionally manual: update it for each release (for example, `1.2.0` to `1.3.0` for a feature release), then rebuild and flash.

Use Settings to change sound, LED, test duration, trial count, lapse threshold, or reset saved data.

## Dashboard and export

The `dashboard/` directory is a Vercel Next.js app using Clerk and Neon.

The dashboard is private to the signed-in Clerk user. On desktop Chrome or Edge over HTTPS, choose **Bluetooth import** and connect to the badge over BLE. The badge advertises a Reflex BLE service and only exports after receiving the explicit `REFLEX_EXPORT_V1` command. It sends `REFLEX_EXPORT `-prefixed newline-delimited JSON begin, session, and end frames; normal debug output is ignored by import tools. USB serial import is still available as a fallback for the Python exporter. Be cautious: the BLE chip on the board is weak, so if it fails, try bringing the board closer to your computer.

The dashboard now works as a broader brain-health console:

- Badge performance history with score, reaction time, consistency, lapse, false-start, accuracy, and rhythm trends.
- Daily health context logs for sleep, stress, mood, exercise, caffeine, hydration, and notes, with multiple check-ins per day supported. Check-in time and context are based on the user's system clock, and total caffeine is floored by the day's logged recent-caffeine entries while still allowing a higher manual total.
- Readiness and cognitive-strain estimates that combine recent session data with the latest health context.
- A transparent readiness model showing expected-vs-observed score, uncertainty range, data-quality flags, response speed, and component contributions for speed, consistency, lapse control, accuracy, memory, and context.
- Early import-day correlation checks between health context and performance scores.
- An adaptive visual memory trainer and a generated daily training plan.
- CSV export with session metrics plus matched import-day health context.

These features are for personal wellness and training. They are not medical diagnosis, treatment, or screening.

Daily health context is intentionally website-only in this prototype. The badge has no keyboard, so on-device features should stay tap-controller friendly: tests, training, summaries, and local session history.

Research contribution is optional and enabled by default. When enabled, future imports copy only badge session metrics into a shared research table using salted SHA-256 pseudonymous user and badge hashes. Health check-ins, profile notes, email, name, and Clerk account IDs are not copied into research session rows.

In a final commercial-style product, the ESP32 trainer could sign into Wi-Fi and sync protected session data to a global processing service that returns heavier analytics back to the user account and possibly down to the trainer. That server would exist only to process and synchronize the user's brain-health training data. This repository is unlikely to fully implement that production Wi-Fi/cloud path; the practical implementation here is local badge logging plus dashboard import, scoped to the signed-in user and backed by the dashboard deployment's database/security controls.

For any browser, create the same uploadable JSON file with Python:

```sh
python3 -m pip install pyserial
python3 dashboard/tools/export_badge.py --port /dev/ttyUSB0 --output reflex-export.json
```

Replace `/dev/ttyUSB0` with the badge's serial port (for example `COM3` on Windows). Imports are idempotent by signed-in user, badge ID, and session number. Deleting cloud history only deletes this account's cloud data; it never changes the badge.

## Troubleshooting

- Blank or incorrect display: check the TFT_eSPI setup above.
- Touch unreliable: adjust `TOUCH_THRESHOLD` in `InputManager.cpp` for the specific badge.
- Badge appears over Bluetooth only once: flash current firmware. The BLE service restarts advertising after dashboard disconnects, so rebooting should not be needed between imports.
