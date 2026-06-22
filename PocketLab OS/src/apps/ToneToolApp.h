#pragma once
#include "AppSupport.h"
class ToneToolApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Tone Tool"; }
  void onEnter() override; void onExit() override; void update(uint32_t nowMs) override; void draw() override; void handleInput(const InputEvent& event) override;
 private: uint16_t frequency_ = 1000; uint8_t duty_ = 50, field_ = 0; bool playing_ = false, sweeping_ = false; uint32_t lastSweepMs_ = 0;
  void applyTone();
};
