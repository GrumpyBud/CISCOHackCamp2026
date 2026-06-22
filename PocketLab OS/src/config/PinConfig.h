#pragma once
#include <Arduino.h>

// The badge display pins are reserved. Do not connect breadboard sensors here.
namespace Pins {
// DISPLAY_* avoids collisions with the TFT_eSPI preprocessor pin macros.
constexpr uint8_t DISPLAY_SCLK = 18;
constexpr uint8_t DISPLAY_MOSI = 23;
constexpr uint8_t DISPLAY_RST = 25;
constexpr uint8_t DISPLAY_DC = 26;
constexpr uint8_t DISPLAY_CS = 19;
constexpr uint8_t DISPLAY_BL = 5;

constexpr uint8_t JOY_X = 34;
constexpr uint8_t JOY_Y = 35;
constexpr uint8_t LED = 22;
constexpr uint8_t BUZZER = 9;
constexpr uint8_t TOUCH_SELECT = 12;
constexpr uint8_t TOUCH_BACK = 14;
constexpr uint8_t TOUCH_ENTER = 27;
constexpr uint8_t TOUCH_MENU = 33;

// Change this short list to match your soldered breadboard header connections.
constexpr uint8_t ANALOG_INPUTS[] = {32, 36, 39};
constexpr size_t ANALOG_INPUT_COUNT = sizeof(ANALOG_INPUTS) / sizeof(ANALOG_INPUTS[0]);
constexpr uint8_t MONITOR_PINS[] = {9, 12, 14, 27, 32, 33, 34, 35, 36, 39};
constexpr size_t MONITOR_PIN_COUNT = sizeof(MONITOR_PINS) / sizeof(MONITOR_PINS[0]);

inline bool isTftPin(uint8_t pin) {
  return pin == DISPLAY_SCLK || pin == DISPLAY_MOSI || pin == DISPLAY_RST || pin == DISPLAY_DC || pin == DISPLAY_CS || pin == DISPLAY_BL;
}
inline bool isUiPin(uint8_t pin) {
  return pin == JOY_X || pin == JOY_Y || pin == TOUCH_SELECT || pin == TOUCH_BACK || pin == TOUCH_ENTER || pin == TOUCH_MENU;
}
inline bool isReserved(uint8_t pin) { return isTftPin(pin) || isUiPin(pin) || pin == LED; }
inline bool isAdcCapable(uint8_t pin) {
  return pin == 32 || pin == 33 || pin == 34 || pin == 35 || pin == 36 || pin == 39;
}
}
