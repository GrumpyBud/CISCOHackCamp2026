#pragma once

// CUHSP 2021 badge defaults. All badge GPIO is 3.3 V logic.
namespace Pins {
constexpr uint8_t LED = 22, BUZZER = 9;
constexpr uint8_t JOY_X = 34, JOY_Y = 35;
constexpr uint8_t TOUCH_SELECT = 12, TOUCH_BACK = 14, TOUCH_START = 27, TOUCH_MENU = 33;
constexpr uint8_t TFT_SCLK = 18, TFT_MOSI = 23, TFT_CS = 19, TFT_DC = 26, TFT_RST = 25, TFT_BL = 5;
}
