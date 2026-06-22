#pragma once
#include <Arduino.h>
#include "App.h"
#include "Storage.h"

class InputManager {
 public:
  explicit InputManager(Storage& storage) : storage_(storage) {}
  void begin();
  bool poll(uint32_t nowMs, InputEvent& event);
  uint16_t rawX() const { return rawX_; }
  uint16_t rawY() const { return rawY_; }
  void recalibrate();
 private:
  Storage& storage_;
  uint16_t rawX_ = 2048, rawY_ = 2048, centerX_ = 2048, centerY_ = 2048;
  int8_t heldDirection_ = 0;
  uint32_t nextRepeatMs_ = 0;
  uint32_t touchLastMs_[4] = {};
  int8_t direction() const;
  bool readTouch(uint8_t index, uint32_t nowMs, InputEvent& event);
};
