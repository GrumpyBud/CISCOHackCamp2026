# PocketLab OS

PocketLab OS is a lightweight embedded app launcher and utility framework for the CUHSP 2021 ESP32 badge. It is **not a real operating system**: it is a small, non-blocking firmware platform that launches focused hardware tools from a 128×128 TFT menu.

It targets Arduino-ESP32 **3.x** and uses `TFT_eSPI` plus `Preferences`. Wi-Fi is intentionally disabled by default and no credentials are stored in source.

## Desktop emulator

A fully interactive Python/Tkinter emulator is included for exercising the complete 128×128 UI without hardware:

```bash
python3 simulator/pocketlab_os_sim.py
```

It renders all launcher apps with synthetic live GPIO data and persistent emulator settings. See [`simulator/README.md`](simulator/README.md) for controls and limitations.

## Confirmed badge display setup

The [CUHSP 2021 badge repository](https://gitlab.com/stinky-fish/cuhsp-2021) documents the following ST7735 setup. `TFT_eSPI_User_Setup_PocketLab.h` contains the matching configuration.

| Function | GPIO | Notes |
|---|---:|---|
| TFT SCLK | 18 | Reserved |
| TFT MOSI | 23 | Reserved |
| TFT CS | 19 | Reserved; the display does not use MISO |
| TFT Reset | 25 | Reserved |
| TFT DC | 26 | Reserved |
| TFT backlight | 5 | Reserved |
| Joystick X | 34 | ADC input-only |
| Joystick Y | 35 | ADC input-only |
| Onboard LED | 22 | Output |
| Passive buzzer | 9 | Optional; external buzzer connected to TP9 |
| Touch Select | 12 | Optional/provisional mapping |
| Touch Back | 14 | Optional/provisional mapping |
| Touch Enter | 27 | Optional/provisional mapping |
| Touch Menu | 33 | Optional/provisional mapping |

All pins are centralized in [`src/config/PinConfig.h`](src/config/PinConfig.h). Update the `ANALOG_INPUTS` and `MONITOR_PINS` arrays to fit your breadboard wiring. Never use a TFT pin for a sensor.

## Project layout

```
PocketLabOS.ino                Arduino entry point
src/config/                  Build and pin configuration
src/core/                    app manager, input, display, storage, buzzer
src/apps/                    independent launcher and utility apps
TFT_eSPI_User_Setup_PocketLab.h
```

Every app follows the small `App` lifecycle in [`src/core/App.h`](src/core/App.h): `onEnter`, `onExit`, `update(nowMs)`, `draw`, and `handleInput`.

## Required software and libraries

- Arduino IDE 2.x or Arduino CLI
- Espressif **esp32 by Espressif Systems**, latest stable 3.x release
- [TFT_eSPI by Bodmer](https://github.com/Bodmer/TFT_eSPI)

`Preferences`, WiFi (when enabled), LEDC, and touch support come from Arduino-ESP32; no EEPROM or SD library is used.

## Setup and upload

1. Install the ESP32 board package from Espressif. Select **ESP32 Dev Module** unless your badge needs a different compatible board setting.
2. Install TFT_eSPI from Library Manager.
3. Copy `TFT_eSPI_User_Setup_PocketLab.h` over `TFT_eSPI/User_Setup.h`, or include/select it from `TFT_eSPI/User_Setup_Select.h`. This is required because TFT_eSPI compiles the display driver pins into the library.
4. Open `PocketLabOS.ino` in Arduino IDE. Arduino requires the sketch directory to also be named `PocketLabOS`; rename the checkout directory if necessary.
5. Confirm the feature switches in `src/config/BuildConfig.h`; defaults are joystick enabled, touch disabled, buzzer enabled, Wi-Fi disabled.
6. Compile and upload. Use serial monitor at 115200 baud if `DEBUG_SERIAL` remains enabled.

Arduino CLI example (from the directory containing the `PocketLabOS` folder):

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 PocketLabOS
arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32 PocketLabOS
```

If the display is offset, blank, or colors are wrong, first verify the TFT_eSPI user setup. Badge examples historically show both `ST7735_GREENTAB` and `ST7735_GREENTAB3`; start with the included `ST7735_GREENTAB` (as documented in the badge screen-text tutorial), then change only that tab definition if your physical panel requires it.

## Controls

- Joystick: up/down selects or adjusts; right opens the highlighted launcher app; left/right change pages, pins, or fields inside tools.
- Touch (when `USE_TOUCH_INPUT=1`): Select, Back, Enter, and Menu use the configured touch pins.
- Back exits any tool to Home.

The badge joystick has no mapped press in this project, so **right** opens the highlighted launcher app. Enable verified touch input for Select, Back, Enter, and Menu actions. This is deliberate: navigation never directly reads breadboard inputs.

## Included apps

| App | Purpose |
|---|---|
| Sensor Lab | Analog/digital readout, voltage estimate, low-pass filtered value, min/max, threshold, and scrolling graph. |
| Scope | 20 ms/sample low-speed waveform view with auto/manual range, pause, min/max/average and approximate crossing frequency. |
| Logic Probe | Digital state, rise/fall counts, last high pulse estimate, and active-high/low interpretation. |
| Pin Monitor | Pages through configured pins, showing digital states and ADC values where applicable; reserved pins are warned. |
| Tone Tool | Modern Arduino-ESP32 3.x LEDC tone output on GPIO 9, duty control, continuous tone, sweep, and stop. |
| I/O Tester | LED output, buzzer beep, joystick raw readings/recalibration, and touch diagnostic values. |
| Settings | Persistent sound, LED feedback, rotation, backlight on/off, deadzone, touch threshold, and factory reset. |
| About | Firmware name/version/build date, board, and Arduino core version. |

## Settings and persistence

Settings use ESP32 `Preferences` namespace `pocketlab`. Persisted values are sound, LED feedback, display rotation, backlight setting, joystick deadzone, touch threshold, and last selected launcher item. Reset Settings clears only this namespace.

## Hardware warnings

- **Every ESP32 GPIO is 3.3 V only. Do not apply 5 V to any input.** Use a divider, level shifter, or a sensor module powered for 3.3 V logic where required.
- GPIO 34–39 are input-only. GPIO 34/35 are already assigned to the joystick.
- GPIO 12 is a boot strapping pin on classic ESP32 modules. A touch/button circuit must not force an invalid boot level during reset. Leave touch input disabled until its wiring is verified.
- GPIO 9 is usually exposed as TP9 for an external passive buzzer on this badge. If it is unavailable, set `ENABLE_BUZZER` to `0`.
- Keep sensors away from the TFT, LED, joystick, and touch pins configured in `PinConfig.h`.
- Make all ground connections common. Do not power 5 V sensors directly into ESP32 signal pins.

## Design limits

- **Scope is low-speed only.** It samples one ADC input about every 20 ms (roughly 50 samples/s) for responsive UI and sensor visualization. It is unsuitable for audio, PWM characterization, serial buses, RF, or high-speed electronics.
- Logic Probe is polling-based. Short pulses and fast edges can be missed. The displayed pulse width is an approximate interval between edges observed by the main loop.
- ADC voltage is an estimate using a nominal 3.3 V full scale. ESP32 ADC nonlinearity and supply variation affect accuracy; calibrate externally for measurements that matter.
- Backlight brightness uses one automatically allocated Arduino-ESP32 3.x LEDC channel. Tone Tool uses a separate automatically allocated channel; classic ESP32 has sufficient channels for this combination.
- Touch mappings are marked provisional because they should be checked against the assembled badge hardware.
- Wi-Fi is off and no web server is included in the default timing-sensitive firmware. Enable it only after deciding its resource and timing budget; never hardcode credentials.

## Troubleshooting

| Symptom | Checks |
|---|---|
| Blank screen | Confirm TFT_eSPI setup was actually selected, common GND, and all six TFT GPIO assignments. Try the alternate green-tab option noted above. |
| Navigation moves continuously | Recalibrate in I/O Tester, then increase joystick deadzone in Settings. |
| Navigation has no Enter control | Enable verified touch input, or provide a touch/button mapped to Enter GPIO 27. |
| Buzzer silent | Confirm a passive buzzer is connected to TP9/GPIO 9 and `ENABLE_BUZZER=1`; active buzzers do not need a variable tone. |
| Sensor always reads zero | Check common ground, 3.3 V power, sensor output voltage, and that the selected pin is in `ANALOG_INPUTS`. |
| Upload/boot fails after touch wiring | Disconnect GPIO 12 hardware and retry; it is a boot strapping pin. |

## Adding an app

1. Add `src/apps/MyApp.h/.cpp` and derive it from `AppSupport` (or directly from `App`).
2. Implement the lifecycle methods. Use `update(nowMs)` for periodic work with `elapsed()`; do not use `delay()` in app logic.
3. Instantiate it in `src/PocketLabOS.cpp`, add its pointer to `apps[]`, and add its label to `LauncherApp.cpp` in the same order.
4. Keep drawing compact and react only when the app marks `needsDraw_`; use the helpers in `Display` for consistent UI.
5. Add pins to `PinConfig.h`, document any electrical requirements, and avoid all reserved pins.

## API compatibility

Tone Tool intentionally uses Arduino-ESP32 3.x APIs: `ledcAttach(pin, frequency, resolution)`, `ledcWrite(pin, duty)`, and `ledcWriteTone(pin, frequency)`. It does not use the removed 2.x `ledcSetup` or `ledcAttachPin` APIs. See Espressif’s [LEDC API documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html) and [2.x → 3.0 migration guide](https://docs.espressif.com/projects/arduino-esp32/en/latest/migration_guides/2.x_to_3.0.html).
