#pragma once

#include <TFT_eSPI.h>

class Display {
 public:
  TFT_eSPI tft;

  void begin();
  void clear(uint16_t color = TFT_BLACK);
  void header(const char* title, uint16_t color = TFT_CYAN);
  void centered(const char* text, int16_t y, uint8_t size = 1, uint16_t color = TFT_WHITE);
  void metric(const char* label, const char* value, int16_t y, uint16_t color = TFT_WHITE);
  void progress(uint8_t current, uint8_t total);
  void menu(const char* const* items, uint8_t count, uint8_t selected);
};
