#pragma once

// User-visible version shown on the boot screen. Bump it for each release.
#define FIRMWARE_VERSION "1.5.7"
// Release date shown on the boot screen and in debug logs.
#define FIRMWARE_RELEASE_DATE "2026-07-08"
#define DEBUG_SERIAL 1
#define ENABLE_BUZZER 1
#define ENABLE_WIFI_DASHBOARD 0
#define ENABLE_BLE_DASHBOARD 1
#define USE_TOUCH_INPUT 1

#if DEBUG_SERIAL
  #define DEBUGF(...) Serial.printf(__VA_ARGS__)
#else
  #define DEBUGF(...)
#endif
