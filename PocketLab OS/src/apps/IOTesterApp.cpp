#include "IOTesterApp.h"
#include "../config/PinConfig.h"
#include <stdio.h>
static const char* const kIoItems[] = {"LED output", "Buzzer beep", "Joystick raw", "Touch diagnostics"};
void IOTesterApp::onEnter() { pinMode(Pins::LED, OUTPUT); selected_ = 0; ledOn_ = false; digitalWrite(Pins::LED, LOW); needsDraw_ = true; }
void IOTesterApp::onExit() { digitalWrite(Pins::LED, LOW); }
void IOTesterApp::update(uint32_t now) { if (elapsed(now, lastRefreshMs_, 100)) { lastRefreshMs_ = now; needsDraw_ = true; } }
void IOTesterApp::draw() {
  if (!needsDraw_) return; char buf[32]; display_.clear(); display_.drawHeader("I/O Tester"); display_.drawMenu(kIoItems, 4, selected_);
  snprintf(buf, sizeof(buf), "LED:%s  X:%u Y:%u", ledOn_ ? "ON" : "OFF", input_.rawX(), input_.rawY()); display_.drawCenteredText(buf, 83, TFT_CYAN);
#if USE_TOUCH_INPUT
  snprintf(buf, sizeof(buf), "T:%u/%u/%u/%u", touchRead(Pins::TOUCH_SELECT), touchRead(Pins::TOUCH_BACK), touchRead(Pins::TOUCH_ENTER), touchRead(Pins::TOUCH_MENU));
  display_.drawCenteredText(buf, 96, TFT_LIGHTGREY);
#else
  display_.drawCenteredText("Touch input disabled", 96, TFT_DARKGREY);
#endif
  display_.drawFooterHints("UP/DN NAV  ENTER RUN"); needsDraw_ = false;
}
void IOTesterApp::handleInput(const InputEvent& e) {
  if (e.type == InputEventType::Up && selected_ > 0) --selected_;
  else if (e.type == InputEventType::Down && selected_ < 3) ++selected_;
  else if (e.type == InputEventType::Select || e.type == InputEventType::Enter) { if (selected_ == 0) { ledOn_ = !ledOn_; digitalWrite(Pins::LED, ledOn_); } else if (selected_ == 1) buzzer_.beep(1300, 100); else if (selected_ == 2) input_.recalibrate(); }
  else return; navBeep(); needsDraw_ = true;
}
