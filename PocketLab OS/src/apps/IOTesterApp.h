#pragma once
#include "AppSupport.h"
class IOTesterApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "I/O Tester"; }
  void onEnter() override; void onExit() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private: uint8_t selected_ = 0; bool ledOn_ = false; uint32_t lastRefreshMs_ = 0;
};
