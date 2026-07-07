#pragma once
#include <cstdint>

// CUHSP 2021 badge defaults. All badge GPIO is 3.3 V logic.
namespace Pins {
constexpr uint8_t LED = 22;
// Optional external feedback; disabled by default because it requires wiring at TP9.
constexpr uint8_t BUZZER = 32;
// All controls are the badge's built-in capacitive pads; no external wiring is required.
// Badge D-pad: S2 = Up, S3 = Down, S0 = Left, S4 = Right.
constexpr uint8_t TOUCH_UP = 2, TOUCH_DOWN = 15, TOUCH_LEFT = 4, TOUCH_RIGHT = 13;
// Xbox-style face buttons: S5 = A/Select, S6 = B/Back, S8 = X/Menu, S7 = Y/Start.
constexpr uint8_t TOUCH_SELECT = 12, TOUCH_BACK = 14, TOUCH_START = 27, TOUCH_MENU = 33;
// TFT pins are configured by TFT_eSPI's User_Setup.h. Do not redeclare its
// TFT_* macros here; this file only defines GPIO used directly by the app.
}
