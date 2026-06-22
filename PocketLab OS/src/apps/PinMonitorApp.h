#pragma once
#include "AppSupport.h"
class PinMonitorApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Pin Monitor"; }
  void onEnter() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private: uint8_t page_ = 0; uint32_t lastRefreshMs_ = 0;
};
