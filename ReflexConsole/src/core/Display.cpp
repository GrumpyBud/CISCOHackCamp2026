#include "Display.h"

void Display::begin() {
  tft.init();
  tft.setRotation(2);
  clear();
}

void Display::clear(uint16_t color) { tft.fillScreen(color); }

void Display::header(const char* title, uint16_t color) {
  tft.fillRect(0, 0, 128, 14, TFT_BLACK);
  tft.drawFastHLine(0, 13, 128, color);
  tft.setTextColor(color, TFT_BLACK);
  tft.setTextSize(1);
  tft.drawString(title, 3, 3);
}

void Display::centered(const char* text, int16_t y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  if (size > 1 && tft.textWidth(text) > 128) tft.setTextSize(1);
  tft.setTextColor(color, TFT_BLACK);
  const int16_t x = (128 - tft.textWidth(text)) / 2;
  tft.drawString(text, x < 0 ? 0 : x, y);
}

void Display::metric(const char* label, const char* value, int16_t y, uint16_t color) {
  tft.setTextSize(1);
  tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
  tft.drawString(label, 5, y);
  tft.setTextColor(color, TFT_BLACK);
  tft.drawRightString(value, 123, y, 1);
}

void Display::progress(uint8_t current, uint8_t total) {
  const uint8_t width = total ? static_cast<uint16_t>(current) * 116 / total : 0;
  tft.drawRect(6, 116, 116, 7, TFT_DARKGREY);
  tft.fillRect(7, 117, width, 5, TFT_CYAN);
}

void Display::menu(const char* const* items, uint8_t count, uint8_t selected) {
  clear();
  header("REFLEX CONSOLE");
  tft.setTextSize(1);

  const int rowHeight = count > 6 ? 15 : 17;
  const int startY = count > 6 ? 18 : 20;
  for (uint8_t i = 0; i < count; ++i) {
    const int y = startY + i * rowHeight;
    if (i == selected) {
      tft.fillRoundRect(3, y - 2, 122, 14, 3, TFT_CYAN);
      tft.setTextColor(TFT_BLACK, TFT_CYAN);
    } else {
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
    }
    tft.drawString(items[i], 10, y);
  }
}
