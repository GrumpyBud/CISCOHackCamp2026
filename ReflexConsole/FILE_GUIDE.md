# Reflex Console file guide

This guide explains what each tracked project file is for and where to make common changes.

## Top level

### `ReflexConsole.ino`

Arduino’s sketch entry point. It creates the one `ReflexApp` object and forwards Arduino’s `setup()` and `loop()` calls to it. Leave this file small; application behavior belongs in `src/`.

### `README.md`

Short setup and usage guide: required libraries, TFT_eSPI configuration, badge pin map, controls, and test descriptions.

### `FILE_GUIDE.md`

This document.

## VS Code configuration

### `.vscode/c_cpp_properties.json`

C/C++ extension configuration for ESP32 Arduino headers, TFT_eSPI, and the ESP32 compiler. It exists for editor completion and error checking; Arduino IDE still handles normal uploads.

### `.vscode/settings.json`

Fallback/default C/C++ include settings. These are duplicated intentionally so IntelliSense works even when VS Code does not expose the named ESP32 configuration in its selector.

## Firmware entry and state machine

### `src/ReflexApp.h`

Declares `ReflexApp`, the application coordinator. Its members own input, display, buzzer, persistent storage, statistics, current state, timers, and fixed trial buffers.

### `src/ReflexApp.cpp`

Implements the product behavior:

- boot splash and main menu;
- Quick, Focus, Choice, and Rhythm test state transitions;
- input handling for each state;
- menu/settings screens and test summaries;
- LED and buzzer feedback;
- saving completed test results.

Start here when changing test flow, adding a menu item, or changing displayed copy. Tests are timed with `millis()` and should stay non-blocking.

## Configuration

### `src/config/BuildConfig.h`

Compile-time feature flags and firmware version:

- `DEBUG_SERIAL` enables serial diagnostics.
- `ENABLE_BUZZER` enables GPIO13/TP9 tone output.
- `ENABLE_WIFI_DASHBOARD` is reserved and disabled.
- `USE_TOUCH_INPUT` and `USE_JOYSTICK_INPUT` select available controls.

### `src/config/PinConfig.h`

One source of truth for board GPIO assignments. The badge schematic confirms the TFT, LED, touch, and joystick values. The optional buzzer is **GPIO13 / TP9**; do not change it to GPIO9, which is a flash signal.

## Core modules

### `src/core/AppState.h`

Defines the `AppState` enum used by the central state machine and the abstract `InputEvent` values delivered by `InputManager`. Add a state here before implementing a new test or screen.

### `src/core/InputManager.h` and `src/core/InputManager.cpp`

Reads joystick and touch inputs and turns them into one-shot events (`UP`, `DOWN`, `SELECT`, and so on). It handles startup joystick calibration, touch edge detection, joystick dead zone, and repeat suppression.

Adjust `TOUCH_THRESHOLD`, `JOYSTICK_DEADZONE`, or `JOYSTICK_REPEAT_MS` in the `.cpp` file when a specific badge needs tuning.

### `src/core/Display.h` and `src/core/Display.cpp`

Owns the `TFT_eSPI` display object and reusable 128×128 drawing helpers:

- `header()` for screen titles;
- `centered()` for prominent status copy;
- `metric()` for label/value summary rows;
- `progress()` for compact progress bars;
- `menu()` for the main menu.

Keep UI drawing code here or add helpers here instead of repeating TFT setup calls across tests.

### `src/core/Buzzer.h` and `src/core/Buzzer.cpp`

Provides non-blocking tone feedback. `beep()` starts a tone using Arduino-ESP32 3.x `ledcAttach()` / `ledcWriteTone()` APIs; `update()` stops it after its scheduled duration. It does not use `delay()`.

### `src/core/MathUtils.h` and `src/core/MathUtils.cpp`

Small fixed-buffer statistics helpers:

- mean;
- in-place median;
- standard deviation;
- 0–100 score clamping;
- exponential moving average.

The median sort is intentionally simple because test buffers are small and fixed.

### `src/core/Stats.h` and `src/core/Stats.cpp`

Defines session data, baseline data, and score logic. The first five Quick Tests build a baseline. Later Quick Tests update it gradually with an exponential moving average. This module also holds the rolling score buffer, personal best, and session count.

### `src/core/Storage.h` and `src/core/Storage.cpp`

Loads and saves settings, baseline fields, compact score history, and the last session with ESP32 `Preferences` (NVS). It also implements the Settings reset actions. No EEPROM, SD card, or Wi-Fi is required.

## Safe extension pattern

To add another test:

1. Add its states to `AppState.h`.
2. Add its menu item in `ReflexApp.cpp`.
3. Initialize its counters in `handle()` when the intro starts.
4. Advance it from `update()` using timestamp comparisons, not `delay()`.
5. Reuse `InputManager`, `Display`, `Stats`, and `Storage` rather than accessing GPIO or Preferences directly from test code.
6. Add only compact persistent summary fields; do not store large raw histories in Preferences.
