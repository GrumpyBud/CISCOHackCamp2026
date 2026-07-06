# FullOS File Guide

## Top Level

- `FullOS.ino`: Arduino entrypoint.
- `README.md`: hardware, setup, controls, and SMS notes.
- `TFT_eSPI_User_Setup_FullOS.h`: TFT_eSPI setup for the badge display.

## Firmware

- `src/FullOS.h`: declares the firmware coordinator, pointer state, settings, app IDs, and app handlers.
- `src/FullOS.cpp`: implements desktop rendering, joystick/touch input, window handling, apps, persistence, Wi-Fi scanning, and hardware tools.
- `src/config/BuildConfig.h`: feature flags and version constants.
- `src/config/PinConfig.h`: GPIO map and pin safety helpers.

## Common Changes

- Change joystick click or right-click touch pins in `src/config/PinConfig.h`.
- Add or remove apps by editing the `AppId` enum, `appListName`, `draw`, and the desktop icon list in `src/FullOS.cpp`.
- Adjust pointer feel in Settings on device, or change defaults in `FullOS.h`.
