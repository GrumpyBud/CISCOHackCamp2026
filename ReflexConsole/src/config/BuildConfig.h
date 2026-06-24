#pragma once

// User-visible version shown on the boot screen. Bump it for each release.
#define FIRMWARE_VERSION "1.1.3"
#define DEBUG_SERIAL 1
#define ENABLE_BUZZER 0
#define ENABLE_WIFI_DASHBOARD 0
#define USE_TOUCH_INPUT 1

#if DEBUG_SERIAL
  #define DEBUGF(...) Serial.printf(__VA_ARGS__)
#else
  #define DEBUGF(...)
#endif
