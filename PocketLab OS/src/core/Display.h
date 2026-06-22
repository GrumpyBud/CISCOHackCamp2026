#pragma once
#include <Arduino.h>
#include <TFT_eSPI.h>
#include "../config/BuildConfig.h"
class Display {
 public:
  void begin(uint8_t rotation, uint8_t brightness);
  void setRotation(uint8_t rotation);
  void setBrightness(uint8_t brightness);
  TFT_eSPI& tft() { return tft_; }
  void clear(uint16_t color = TFT_BLACK);
  void drawHeader(const char* title, const char* right = nullptr);
  void drawFooterHints(const char* text);
  void drawCenteredText(const char* text, int16_t y, uint16_t color = TFT_WHITE, uint8_t font = 1);
  void drawMenu(const char* const* items, uint8_t count, uint8_t selected, uint8_t top = 0);
  void drawMetric(const char* label, const char* value, int16_t y, uint16_t color = TFT_CYAN);
  void drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t value, uint16_t maxValue, uint16_t color);
 void drawWarning(const char* text);
 private:
 TFT_eSPI tft_;
  bool backlightAttached_ = false;
};
