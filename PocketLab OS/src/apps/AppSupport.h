#pragma once
#include "../core/App.h"
#include "../core/Display.h"
#include "../core/Storage.h"
#include "../core/Buzzer.h"
#include "../core/InputManager.h"
#include "../core/AppManager.h"
#include "../core/MathUtils.h"
#include "../core/Timing.h"

class AppSupport : public App {
 public:
  AppSupport(Display& display, Storage& storage, Buzzer& buzzer, InputManager& input, AppManager& manager)
      : display_(display), storage_(storage), buzzer_(buzzer), input_(input), manager_(manager) {}
  void onExit() override {}
 protected:
  Display& display_; Storage& storage_; Buzzer& buzzer_; InputManager& input_; AppManager& manager_;
  bool needsDraw_ = true;
  void navBeep() { if (storage_.settings().soundOn) buzzer_.beep(1500, 18); }
};
