#pragma once

// Feature switches. Set to 0 for hardware that is not fitted.
#ifndef DEBUG_SERIAL
#define DEBUG_SERIAL 1
#endif
#ifndef ENABLE_BUZZER
#define ENABLE_BUZZER 1
#endif
#ifndef ENABLE_WIFI
#define ENABLE_WIFI 0
#endif
#ifndef USE_TOUCH_INPUT
#define USE_TOUCH_INPUT 0
#endif
#ifndef USE_JOYSTICK_INPUT
#define USE_JOYSTICK_INPUT 1
#endif

#define POCKETLAB_VERSION "0.1.0"
#define POCKETLAB_BOARD "CUHSP 2021 ESP32 badge"
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 128
#define UI_HEADER_HEIGHT 14
#define UI_FOOTER_HEIGHT 12
#define ADC_MAX_VALUE 4095
#define ADC_REFERENCE_VOLTS 3.3f
#define ENABLE_WIFI_STATUS_PAGE 0
