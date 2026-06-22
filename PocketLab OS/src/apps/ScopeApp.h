#pragma once
#include "AppSupport.h"
class ScopeApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Scope"; }
  void onEnter() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private:
  static constexpr uint8_t N = 96; uint16_t samples_[N] = {}; uint8_t pinIndex_ = 0; bool paused_ = false, autoScale_ = true;
  uint16_t last_ = 0, min_ = 4095, max_ = 0; uint32_t sum_ = 0, count_ = 0, lastSampleMs_ = 0, lastCrossMs_ = 0, periodMs_ = 0;
  uint16_t manualTop_ = 4095;
  void clearStats();
};
