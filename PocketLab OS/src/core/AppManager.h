#pragma once
#include "App.h"
#include "Display.h"
#include "Storage.h"
#include "Buzzer.h"
class AppManager {
 public:
  AppManager(Display& display, Storage& storage, Buzzer& buzzer) : display_(display), storage_(storage), buzzer_(buzzer) {}
  void setApps(App** apps, uint8_t count);
  void begin();
  void update(uint32_t nowMs);
  void handleInput(const InputEvent& event);
  void launch(uint8_t index);
  void home();
  uint8_t currentIndex() const { return current_; }
  uint8_t appCount() const { return appCount_; }
 private:
  Display& display_; Storage& storage_; Buzzer& buzzer_;
  App** apps_ = nullptr; uint8_t appCount_ = 0, current_ = 0; bool dirty_ = true;
};
