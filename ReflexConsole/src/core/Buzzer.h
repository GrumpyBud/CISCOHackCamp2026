#pragma once

#include <Arduino.h>

class Buzzer {
 public:
  void begin();
  void beep(uint16_t frequencyHz, uint16_t durationMs);
  void update(uint32_t now);
  void stop();

 private:
  uint32_t until = 0;
};
