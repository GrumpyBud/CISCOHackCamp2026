#pragma once
#include "AppSupport.h"
class SensorLabApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Sensor Lab"; }
  void onEnter() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private:
  static constexpr uint8_t GRAPH = 56; uint16_t samples_[GRAPH] = {}; uint8_t pinIndex_ = 0, cursor_ = 0; bool digitalMode_ = false;
  uint16_t raw_ = 0, filtered_ = 0, min_ = 4095, max_ = 0, threshold_ = 2048; uint32_t lastSampleMs_ = 0;
  void resetStats();
};
