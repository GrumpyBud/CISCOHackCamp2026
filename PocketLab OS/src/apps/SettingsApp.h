#pragma once
#include "AppSupport.h"
class SettingsApp : public AppSupport {
 public:
  using AppSupport::AppSupport;
  const char* name() const override { return "Settings"; }
  void onEnter() override; void update(uint32_t) override {} void draw() override; void handleInput(const InputEvent& event) override;
 private: uint8_t selected_ = 0; void change(int direction);
};
