#pragma once
#include <Arduino.h>
#include "../config/BuildConfig.h"
#include "../config/PinConfig.h"
class Buzzer {
 public:
  void begin();
  void setEnabled(bool enabled) { enabled_ = enabled; if (!enabled_) stop(); }
  void tone(uint16_t hz, uint8_t dutyPercent = 50);
  void stop();
  void beep(uint16_t hz = 1800, uint16_t durationMs = 35);
  void update(uint32_t nowMs);
  bool active() const { return active_; }
 private:
  bool enabled_ = true, attached_ = false, active_ = false;
  uint32_t stopAt_ = 0;
};
