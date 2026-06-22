#include "Display.h"
#include "../config/PinConfig.h"
void Display::begin(uint8_t rotation, uint8_t brightness) {
  pinMode(Pins::DISPLAY_BL, OUTPUT); tft_.init(); setRotation(rotation);
  backlightAttached_ = ledcAttach(Pins::DISPLAY_BL, 5000, 8);
  setBrightness(brightness); clear();
}
void Display::setRotation(uint8_t rotation) { tft_.setRotation(rotation & 3); }
void Display::setBrightness(uint8_t brightness) {
  if (backlightAttached_) ledcWrite(Pins::DISPLAY_BL, brightness);
  else digitalWrite(Pins::DISPLAY_BL, brightness > 0 ? HIGH : LOW);
}
void Display::clear(uint16_t color) { tft_.fillScreen(color); }
void Display::drawHeader(const char* title, const char* right) {
  tft_.fillRect(0, 0, SCREEN_WIDTH, UI_HEADER_HEIGHT, TFT_DARKGREY);
  tft_.setTextFont(1); tft_.setTextColor(TFT_WHITE, TFT_DARKGREY); tft_.drawString(title, 3, 3);
  if (right) tft_.drawRightString(right, SCREEN_WIDTH - 3, 3, 1);
}
void Display::drawFooterHints(const char* text) {
  tft_.fillRect(0, SCREEN_HEIGHT - UI_FOOTER_HEIGHT, SCREEN_WIDTH, UI_FOOTER_HEIGHT, TFT_DARKGREY);
  tft_.setTextFont(1); tft_.setTextColor(TFT_LIGHTGREY, TFT_DARKGREY); tft_.drawCentreString(text, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 10, 1);
}
void Display::drawCenteredText(const char* text, int16_t y, uint16_t color, uint8_t font) {
  tft_.setTextColor(color, TFT_BLACK); tft_.drawCentreString(text, SCREEN_WIDTH / 2, y, font);
}
void Display::drawMenu(const char* const* items, uint8_t count, uint8_t selected, uint8_t top) {
  const uint8_t rows = 7;
  for (uint8_t row = 0; row < rows; ++row) {
    const uint8_t i = top + row; if (i >= count) break;
    const int16_t y = UI_HEADER_HEIGHT + 2 + row * 14;
    const bool active = i == selected;
    tft_.fillRect(2, y, 124, 12, active ? TFT_BLUE : TFT_BLACK);
    tft_.setTextColor(active ? TFT_WHITE : TFT_LIGHTGREY, active ? TFT_BLUE : TFT_BLACK);
    tft_.drawString(items[i], 6, y + 2, 1);
  }
}
void Display::drawMetric(const char* label, const char* value, int16_t y, uint16_t color) {
  tft_.setTextColor(TFT_LIGHTGREY, TFT_BLACK); tft_.drawString(label, 3, y, 1);
  tft_.setTextColor(color, TFT_BLACK); tft_.drawRightString(value, 125, y, 1);
}
void Display::drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t value, uint16_t maxValue, uint16_t color) {
  tft_.drawRect(x, y, w, h, TFT_DARKGREY); const int16_t fill = maxValue ? ((w - 2) * value) / maxValue : 0;
  tft_.fillRect(x + 1, y + 1, fill, h - 2, color); tft_.fillRect(x + 1 + fill, y + 1, w - 2 - fill, h - 2, TFT_BLACK);
}
void Display::drawWarning(const char* text) { tft_.fillRect(0, 104, 128, 12, TFT_MAROON); tft_.setTextColor(TFT_YELLOW, TFT_MAROON); tft_.drawCentreString(text, 64, 106, 1); }
