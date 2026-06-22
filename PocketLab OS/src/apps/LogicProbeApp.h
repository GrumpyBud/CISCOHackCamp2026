#pragma once
#include "AppSupport.h"
class LogicProbeApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Logic Probe"; }
  void onEnter() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private:
  uint8_t pinIndex_ = 0; bool activeHigh_ = true, state_ = false, previous_ = false; uint32_t rising_ = 0, falling_ = 0, highStartUs_ = 0, pulseUs_ = 0, lastUpdateMs_ = 0;
  void configurePin();
};
